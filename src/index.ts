// src/index.ts

// ... [همه import ها و تعریفات Env و Durable Object ثابت می‌مانند] ...

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        // --- مسیر ۱: ثبت فروش (POST) ---
        if (request.method === 'POST' && url.pathname === '/api/sales/register') {
            // [تمام منطق ثبت فروش POST قبلی در اینجا قرار می‌گیرد] 
            // ... (کد POST شما) ... 
            
        } 
        
        // --- مسیر ۲: دریافت داده‌های داشبورد (GET) ---
        else if (request.method === 'GET' && url.pathname === '/api/sales/data') {
            // ۱. خواندن داده‌ها از D1
            const { results } = await env.DB.prepare("SELECT * FROM sales ORDER BY sale_date DESC LIMIT 100").all();
            
            // ۲. پاسخ به صورت JSON
            return new Response(JSON.stringify({ sales: results }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }
        
        // --- مسیر ۳: دریافت فایل CSV/Excel (GET) ---
        else if (request.method === 'GET' && url.pathname === '/api/sales/export') {
            // در اینجا باید تمام داده‌ها را خوانده و به فرمت CSV تبدیل کنیم
            const { results } = await env.DB.prepare("SELECT * FROM sales").all();
            
            // تابع کمکی برای تبدیل JSON به CSV (باید در Worker تعریف شود)
            const csv = jsonToCsv(results); 

            return new Response(csv, {
                headers: {
                    'Content-Type': 'text/csv',
                    'Content-Disposition': 'attachment; filename="honor_sales_export.csv"',
                },
            });
        }
        
        // --- پاسخ پیش‌فرض: مسیر نامعتبر ---
        return new Response(JSON.stringify({ message: 'Not Found or Method Not Allowed' }), { status: 404 });
    },
};

// تابع کمکی (Helper Function) برای تبدیل JSON به CSV
const jsonToCsv = (items) => {
    if (!items || items.length === 0) {
        return "";
    }
    
    // ۱. استخراج سرصفحه‌ها
    const header = Object.keys(items[0]).join(',');
    
    // ۲. تبدیل ردیف‌ها
    const rows = items.map(row => 
        Object.values(row).map(value => {
            // اگر مقدار دارای کاما یا نقل قول بود، آن را داخل نقل قول بگذارید
            if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        }).join(',')
    );
    
    return [header, ...rows].join('\n');
};
