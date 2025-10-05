// src/index.ts

// ۱. اعلامیه کلاس Durable Object (لازم برای لینک شدن)
export { IMEI_Manager } from './imei_manager'; 

// ۲. تعریف یکتای متغیرهای محیطی
export interface Env {
    DB: D1Database;
    IMEI_MANAGER: DurableObjectNamespace;
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        
        // مسیر فقط POST /api/sales/register را می‌پذیرد
        if (request.method !== 'POST' || url.pathname !== '/api/sales/register') {
            return new Response(JSON.stringify({ message: 'Not Found or Method Not Allowed' }), { status: 404 });
        }
        
        // ۱. احراز هویت (ساده سازی شده برای تست)
        const sellerId = request.headers.get('X-Seller-ID'); 
        if (!sellerId) {
            return new Response(JSON.stringify({ message: 'Authentication Required: X-Seller-ID header missing' }), { status: 401 });
        }

        // ۲. دریافت و پارس کردن داده‌های JSON
        let data;
        try {
            data = await request.json();
        } catch (e) {
            return new Response(JSON.stringify({ message: "Invalid JSON format." }), { status: 400 });
        }
        
        const { imei, phone_model, sale_date, city, phone_number } = data;
        
        if (!imei || !phone_model || !sale_date) {
            return new Response(JSON.stringify({ message: 'Missing required fields (imei, phone_model, sale_date).' }), { status: 400 });
        }

        // ۳. جلوگیری از ثبت مکرر IMEI با Durable Object
        const imeiManagerId = env.IMEI_MANAGER.idFromName(sellerId);
        const imeiManagerStub = env.IMEI_MANAGER.get(imeiManagerId);
        
        // ارسال درخواست داخلی به Durable Object برای قفل کردن IMEI
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
             // Rollback: در صورت شکست D1، IMEI را از DO آزاد می‌کنیم
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
