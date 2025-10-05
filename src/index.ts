// src/index.ts

export interface Env {
    DB: D1Database;
    IMEI_MANAGER: DurableObjectNamespace;
    // R2 binding حذف شد
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

        // ۲. دریافت و پارس کردن داده‌ها (از JSON استفاده می‌کنیم نه multipart/form-data)
        const data = await request.json();
        const { imei, phone_model, sale_date, city, phone_number } = data;
        
        if (!imei || !phone_model || !sale_date) {
            return new Response(JSON.stringify({ message: 'Missing required fields (imei, phone_model, sale_date).' }), { status: 400 });
        }

        // ۳. جلوگیری از ثبت مکرر IMEI با Durable Object
        const imeiManagerId = env.IMEI_MANAGER.idFromName(sellerId);
        const imeiManagerStub = env.IMEI_MANAGER.get(imeiManagerId);
        
        // ارسال درخواست داخلی به Durable Object
        const doResponse = await imeiManagerStub.fetch('https://do.example.com/check-and-lock', {
            method: 'POST',
            body: JSON.stringify({ imei }),
            headers: { 'Content-Type': 'application/json' },
        });

        if (doResponse.status === 409) {
            // IMEI تکراری است و توسط DO مسدود شده
            return new Response(await doResponse.text(), { status: 409, headers: { 'Content-Type': 'application/json' } });
        } else if (doResponse.status !== 200) {
            return new Response(JSON.stringify({ message: "Error communicating with IMEI manager." }), { status: 500 });
        }
        
        // ۴. ذخیره رکورد فروش در D1
        const saleId = crypto.randomUUID();
        const stmt = env.DB.prepare(
            `INSERT INTO sales (id, seller_id, imei, phone_model, sale_date, city, phone_number) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        );
        
        try {
            await env.DB.batch([
                stmt.bind(saleId, sellerId, imei, phone_model, sale_date, city, phone_number)
            ]);
        } catch (d1Error) {
             // در صورت شکست D1، عملیات باید Rollback شود (IMEI را از DO آزاد کنیم)
             await imeiManagerStub.fetch('https://do.example.com/unlock', { method: 'POST', body: JSON.stringify({ imei }) });
            return new Response(JSON.stringify({ message: "Failed to save sale data to D1. Rollback performed." }), { status: 500 });
        }

        // ۵. پاسخ موفقیت آمیز
        return new Response(JSON.stringify({ 
            success: true, 
            saleId, 
            message: "Sale recorded and IMEI locked successfully."
        }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    },
};
