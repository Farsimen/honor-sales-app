import { IRequest, Router } from 'itty-router';

export interface Env {
    IMEI_MANAGER: DurableObjectNamespace;
    honor_sales_db: D1Database;
}

const ADMIN_PASSWORD = 'Honor2025Admin!';

function authenticateAdmin(request: Request): boolean {
    const authHeader = request.headers.get('X-Admin-Password');
    return authHeader === ADMIN_PASSWORD;
}

function createCORSHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Seller-ID, X-Admin-Password, Accept, Authorization',
        'Access-Control-Max-Age': '86400',
    };
}

function createResponse(data: any, status: number = 200, additionalHeaders: Record<string, string> = {}) {
    const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        ...createCORSHeaders(),
        ...additionalHeaders
    };
    
    return new Response(JSON.stringify(data), { status, headers });
}

export class IMEI_Manager {
    state: DurableObjectState;
    env: Env;

    constructor(state: DurableObjectState, env: Env) {
        this.state = state;
        this.env = env;
    }
    
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: createCORSHeaders() });
        }

        if (request.method === 'POST') {
            try {
                const sellerId = request.headers.get('X-Seller-ID');
                const data: any = await request.json();
                
                if (!sellerId) {
                    return createResponse({ 
                        success: false,
                        message: "کد فروشنده (X-Seller-ID) یافت نشد" 
                    }, 401);
                }

                if (!data.imei || data.imei.length !== 15) {
                    return createResponse({ 
                        success: false,
                        message: "شماره IMEI باید دقیقاً 15 رقم باشد" 
                    }, 400);
                }

                const existingCheck = await this.env.honor_sales_db.prepare(
                    "SELECT id FROM sales WHERE imei = ?"
                ).bind(data.imei).first();

                if (existingCheck) {
                    return createResponse({ 
                        success: false,
                        message: `شماره IMEI ${data.imei} قبلاً ثبت شده است` 
                    }, 409);
                }
                
                const saleId = `sale-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const statement = this.env.honor_sales_db.prepare(
                    "INSERT INTO sales (id, seller_id, imei, phone_model, sale_date, city, phone_number, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
                );

                const result = await statement.bind(
                    saleId,
                    sellerId,
                    data.imei,
                    data.phone_model,
                    data.sale_date,
                    data.city || null,
                    data.phone_number || null,
                    new Date().toISOString()
                ).run();
                
                if (!result.success) {
                    return createResponse({ 
                        success: false,
                        message: "خطا در ذخیره اطلاعات در پایگاه داده" 
                    }, 500);
                }
                
                return createResponse({ 
                    success: true,
                    message: "ثبت فروش با موفقیت انجام شد.",
                    saleId: saleId,
                    timestamp: new Date().toLocaleString('fa-IR')
                });

            } catch (e: any) {
                console.error('Database error:', e);
                return createResponse({ 
                    success: false,
                    message: `خطای سرور داخلی: ${e.message}` 
                }, 500);
            }
        }
        
        return createResponse({ 
            success: false,
            message: "متد درخواست مجاز نیست" 
        }, 405);
    }
}

const router = Router();

router.get('/', () => {
    return createResponse({ 
        message: "Honor Sales Worker API v2.1 - Galaxy Edition",
        status: "active",
        timestamp: new Date().toISOString(),
        endpoints: [
            "POST /api/sales/register - Register new sale",
            "GET /api/sales/data - View sales data (admin only)",
            "GET /api/admin/export - Export CSV (admin only)",
            "DELETE /api/admin/clear - Clear all data (admin only)"
        ]
    });
});

router.post('/api/sales/register', async (request: IRequest, env: Env) => {
    try {
        const id = env.IMEI_MANAGER.idFromName("global-sales-manager");
        const stub = env.IMEI_MANAGER.get(id);
        return stub.fetch(request);
    } catch (error: any) {
        return createResponse({ 
            success: false,
            message: `خطا در اتصال به Durable Object: ${error.message}` 
        }, 500);
    }
});

// مسیر مشاهده داده‌ها - فقط برای ادمین
router.get('/api/sales/data', async (request: IRequest, env: Env) => {
    if (!authenticateAdmin(request)) {
        return createResponse({ 
            success: false,
            message: "دسترسی غیرمجاز: احراز هویت مدیریت الزامی است" 
        }, 401);
    }

    try {
        const { results } = await env.honor_sales_db.prepare(
            "SELECT * FROM sales ORDER BY created_at DESC LIMIT 1000"
        ).all();
        
        return createResponse({ 
            success: true,
            count: results?.length || 0,
            data: results || []
        });
    } catch (error: any) {
        return createResponse({ 
            success: false,
            message: `خطا در بازیابی داده‌ها: ${error.message}` 
        }, 500);
    }
});

// مسیر دانلود خروجی CSV - فقط برای ادمین
router.get('/api/admin/export', async (request: IRequest, env: Env) => {
    if (!authenticateAdmin(request)) {
        return createResponse({ 
            success: false,
            message: "دسترسی غیرمجاز: احراز هویت مدیریت الزامی است" 
        }, 401);
    }

    try {
        const { results } = await env.honor_sales_db.prepare(
            "SELECT * FROM sales ORDER BY created_at DESC"
        ).all();
        
        if (!results || results.length === 0) {
            const emptyCSV = '\uFEFFشناسه,کد فروشنده,IMEI,مدل,تاریخ فروش,شهر,شماره تماس,تاریخ ثبت\n';
            return new Response(emptyCSV, { 
                headers: { 
                    'Content-Type': 'text/csv; charset=utf-8-bom', 
                    'Content-Disposition': 'attachment; filename="honor_sales_empty.csv"',
                    ...createCORSHeaders()
                }
            });
        }

        // تبدیل JSON به CSV با encoding مناسب برای فارسی
        let csv = '\uFEFFشناسه,کد فروشنده,IMEI,مدل,تاریخ فروش,شهر,شماره تماس,تاریخ ثبت\n';
        results.forEach((row: any) => {
            const formatDate = (dateStr: string) => {
                try {
                    return new Date(dateStr).toLocaleDateString('fa-IR');
                } catch {
                    return dateStr;
                }
            };
            
            csv += `"${row.id || ''}","${row.seller_id || ''}","${row.imei || ''}","${row.phone_model || ''}","${row.sale_date || ''}","${row.city || ''}","${row.phone_number || ''}","${formatDate(row.created_at)}"\n`;
        });

        const fileName = `honor_sales_export_${new Date().toISOString().split('T')[0]}.csv`;
        
        return new Response(csv, { 
            status: 200,
            headers: { 
                'Content-Type': 'text/csv; charset=utf-8-bom', 
                'Content-Disposition': `attachment; filename="${fileName}"`,
                'Cache-Control': 'no-cache',
                ...createCORSHeaders()
            }
        });
    } catch (error: any) {
        console.error('Export error:', error);
        return createResponse({ 
            success: false,
            message: `خطا در تولید فایل CSV: ${error.message}` 
        }, 500);
    }
});

// مسیر پاک کردن داده‌ها - فقط مدیر
router.delete('/api/admin/clear', async (request: IRequest, env: Env) => {
    if (!authenticateAdmin(request)) {
        return createResponse({ 
            success: false,
            message: "دسترسی غیرمجاز: احراز هویت مدیریت الزامی است" 
        }, 401);
    }

    try {
        const result = await env.honor_sales_db.prepare(
            "DELETE FROM sales"
        ).run();
        
        return createResponse({ 
            success: true,
            message: `تمام داده‌ها پاک شد (${result.changes} رکورد حذف شد)`,
            deleted_records: result.changes
        });
    } catch (error: any) {
        return createResponse({ 
            success: false,
            message: `خطا در پاک کردن داده‌ها: ${error.message}` 
        }, 500);
    }
});

// Handle all other routes
router.all('*', () => createResponse({ 
    success: false,
    message: "مسیر یافت نشد" 
}, 404));

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        // Handle CORS preflight requests
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: createCORSHeaders()
            });
        }

        try {
            return router.handle(request, env, ctx);
        } catch (error: any) {
            console.error('Worker error:', error);
            return createResponse({ 
                success: false,
                message: `خطای عمومی Worker: ${error.message}`,
                timestamp: new Date().toISOString()
            }, 500);
        }
    },
    
    IMEI_Manager: IMEI_Manager,
};