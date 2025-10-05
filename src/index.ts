
// src/index.ts

export interface Env {
    DB: D1Database;
    INVOICE_BUCKET: R2Bucket;
    IMEI_MANAGER: DurableObjectNamespace;
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        
        if (request.method !== 'POST' || url.pathname !== '/api/sales/register') {
            return new Response(JSON.stringify({ message: 'Not Found or Method Not Allowed' }), { status: 404 });
        }
        
        // ۱. احراز هویت (ساده سازی شده برای تست)
        const sellerId = request.headers.get('X-Seller-ID'); 
        if (!sellerId) {
            return new Response(JSON.stringify({ message: 'Authentication Required: X-Seller-ID header missing' }), { status: 401 });
        }

        // ۲. دریافت و پارس کردن داده‌ها
        const formData = await request.formData();
        const imei = formData.get('imei') as string;
        const phoneModel = formData.get('phone_model') as string;
        const invoiceFile = formData.get('invoice_file') as File;
        
        if (!imei || !phoneModel || !invoiceFile) {
            return new Response(JSON.stringify({ message: 'Missing required form fields.' }), { status: 400 });
        }

        // ۳. جلوگیری از ثبت مکرر IMEI با Durable Object
        const imeiManagerId = env.IMEI_MANAGER.idFromName(sellerId);
        const imeiManagerStub = env.IMEI_MANAGER.get(imeiManagerId);
        
        const doResponse = await imeiManagerStub.fetch('https://do.example.com/check-and-lock', {
            method: 'POST',
            body: JSON.stringify({ imei }),
            headers: { 'Content-Type': 'application/json' },
        });

        if (doResponse.status === 409) {
            return new Response(await doResponse.text(), { status: 409, headers: { 'Content-Type': 'application/json' } });
        } else if (doResponse.status !== 200) {
            return new Response(JSON.stringify({ message: "Error communicating with IMEI manager." }), { status: 500 });
        }
        
        // ۴. ذخیره تصویر در R2
        const fileKey = `${sellerId}/${imei}_${Date.now()}_${invoiceFile.name}`;
        
        try {
            await env.INVOICE_BUCKET.put(fileKey, invoiceFile.stream());
        } catch (r2Error) {
            // در صورت شکست R2، عملیات باید Rollback شود. (برای سادگی، Rollback در اینجا حذف شده است)
            return new Response(JSON.stringify({ message: "Failed to upload invoice image to R2." }), { status: 500 });
        }
        
        // URL دسترسی به تصویر در R2 (نیاز به Public Access)
        const invoiceUrl = `https://${env.INVOICE_BUCKET.accountId}.r2.dev/${fileKey}`; 

        // ۵. ذخیره رکورد فروش در D1
        const saleId = crypto.randomUUID();
        const stmt = env.DB.prepare(
            `INSERT INTO sales (id, seller_id, imei, phone_model, sale_date, city, phone_number, invoice_url) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        );
        
        try {
            await env.DB.batch([
                stmt.bind(saleId, sellerId, imei, phoneModel, new Date().toISOString(), 'N/A', 'N/A', invoiceUrl)
            ]);
        } catch (d1Error) {
             // در صورت شکست D1، عملیات باید Rollback شود.
            return new Response(JSON.stringify({ message: "Failed to save sale data to D1." }), { status: 500 });
        }

        return new Response(JSON.stringify({ 
            success: true, 
            saleId, 
            message: "Sale recorded successfully."
        }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    },
};
