// فایل: src/index.ts (کد بهبود یافته Worker با احراز هویت ادمین و Frontend)

import { IRequest, Router } from 'itty-router';

// تعریف Worker Environment - باید با BINDING های wrangler.toml مطابقت داشته باشد
export interface Env {
    IMEI_MANAGER: DurableObjectNamespace; // Durable Object Binding
    honor_sales_db: D1Database;          // D1 Database Binding
}

// رمز عبور ادمین
const ADMIN_PASSWORD = "Honor2025Admin!";

// تابع کمکی برای بررسی احراز هویت ادمین
function isAdminAuthenticated(request: Request): boolean {
    const auth = request.headers.get('Authorization');
    return auth === `Bearer ${ADMIN_PASSWORD}`;
}

// کلاس Durable Object برای مدیریت حالت و قفل IMEI
export class IMEI_Manager {
    state: DurableObjectState;
    env: Env;

    constructor(state: DurableObjectState, env: Env) {
        this.state = state;
        this.env = env;
    }
    
    // Durable Object برای POST ثبت فروش
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'POST') {
            try {
                const sellerId = request.headers.get('X-Seller-ID') || 'anonymous';
                const data: any = await request.json();
                
                // اعتبارسنجی IMEI
                if (!data.imei || data.imei.length !== 15) {
                    return new Response(JSON.stringify({ 
                        success: false,
                        message: "شماره IMEI باید دقیقاً 15 رقم باشد" 
                    }), { 
                        status: 400,
                        headers: { 
                            'Content-Type': 'application/json; charset=utf-8',
                            'Access-Control-Allow-Origin': '*' 
                        }
                    });
                }

                // بررسی تکراری نبودن IMEI
                const existingCheck = await this.env.honor_sales_db.prepare(
                    "SELECT id FROM sales WHERE imei = ?"
                ).bind(data.imei).first();

                if (existingCheck) {
                    return new Response(JSON.stringify({ 
                        success: false,
                        message: `شماره IMEI ${data.imei} قبلاً ثبت شده است` 
                    }), { 
                        status: 409,
                        headers: { 
                            'Content-Type': 'application/json; charset=utf-8',
                            'Access-Control-Allow-Origin': '*' 
                        }
                    });
                }
                
                // --- عملیات D1: ثبت فروش (با store_name) ---
                const saleId = `sale-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const statement = this.env.honor_sales_db.prepare(
                    "INSERT INTO sales (id, seller_id, imei, phone_model, sale_date, city, phone_number, store_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
                );

                const result = await statement.bind(
                    saleId,
                    sellerId,
                    data.imei,
                    data.phone_model || 'نامشخص',
                    data.sale_date || new Date().toISOString().split('T')[0],
                    data.city || null,
                    data.phone_number || null,
                    data.store_name || null,  // ✅ اضافه شد
                    new Date().toISOString()
                ).run();
                
                if (!result.success) {
                    return new Response(JSON.stringify({ 
                        success: false,
                        message: "خطا در ذخیره اطلاعات در پایگاه داده" 
                    }), { 
                        status: 500,
                        headers: { 
                            'Content-Type': 'application/json; charset=utf-8',
                            'Access-Control-Allow-Origin': '*' 
                        }
                    });
                }
                
                // --- پاسخ موفقیت آمیز ---
                return new Response(JSON.stringify({ 
                    success: true,
                    message: "ثبت فروش با موفقیت انجام شد.",
                    saleId: saleId,
                    timestamp: new Date().toLocaleString('fa-IR')
                }), { 
                    status: 200,
                    headers: { 
                        'Content-Type': 'application/json; charset=utf-8', 
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type, X-Seller-ID, Authorization'
                    }
                });

            } catch (e: any) {
                console.error('Database error:', e);
                return new Response(JSON.stringify({ 
                    success: false,
                    message: `خطای سرور داخلی: ${e.message}` 
                }), { 
                    status: 500,
                    headers: { 
                        'Content-Type': 'application/json; charset=utf-8',
                        'Access-Control-Allow-Origin': '*' 
                    }
                });
            }
        }
        return new Response(JSON.stringify({ 
            success: false,
            message: "متد درخواست مجاز نیست" 
        }), { 
            status: 405,
            headers: { 
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*' 
            }
        });
    }
}

// Worker اصلی
const router = Router();

// Root endpoint - سرو Frontend HTML با طراحی اصلی Canvas
router.get('/', () => {
    // در اینجا کد HTML کامل frontend از repository honor-sales-frontend استفاده می‌شود
    return Response.redirect('https://farsimen.github.io/honor-sales-frontend/', 302);
});

// API info endpoint
router.get('/api', () => {
    return new Response(JSON.stringify({ 
        message: "Honor Sales Worker API v1.0",
        status: "active",
        endpoints: [
            "POST /api/sales/register",
            "GET /api/sales/data", 
            "GET /api/sales/export",
            "POST /api/admin/login",
            "DELETE /api/admin/delete-all"
        ]
    }), { 
        headers: { 
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*' 
        }
    });
});

// 1. مسیر ثبت فروش (POST): هدایت به Durable Object
router.post('/api/sales/register', async (request: IRequest, env: Env) => {
    try {
        // ID ثابت برای هدایت تمام درخواست‌های ثبت به یک DO
        const id = env.IMEI_MANAGER.idFromName("global-sales-manager");
        const stub = env.IMEI_MANAGER.get(id);
        return stub.fetch(request);
    } catch (error: any) {
        return new Response(JSON.stringify({ 
            success: false,
            message: `خطا در اتصال به Durable Object: ${error.message}` 
        }), { 
            status: 500,
            headers: { 
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*' 
            }
        });
    }
});

// 2. مسیر ورود ادمین
router.post('/api/admin/login', async (request: IRequest, env: Env) => {
    try {
        const { password } = await request.json() as { password: string };
        
        if (password === ADMIN_PASSWORD) {
            return new Response(JSON.stringify({ 
                success: true,
                message: "ورود موفقیت‌آمیز",
                token: ADMIN_PASSWORD
            }), { 
                headers: { 
                    'Content-Type': 'application/json; charset=utf-8',
                    'Access-Control-Allow-Origin': '*' 
                }
            });
        } else {
            return new Response(JSON.stringify({ 
                success: false,
                message: "رمز عبور نادرست" 
            }), { 
                status: 401,
                headers: { 
                    'Content-Type': 'application/json; charset=utf-8',
                    'Access-Control-Allow-Origin': '*' 
                }
            });
        }
    } catch (error: any) {
        return new Response(JSON.stringify({ 
            success: false,
            message: "خطا در پردازش درخواست ورود" 
        }), { 
            status: 400,
            headers: { 
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*' 
            }
        });
    }
});

// 3. مسیر مشاهده داده‌ها (فقط برای ادمین)
router.get('/api/sales/data', async (request: IRequest, env: Env) => {
    if (!isAdminAuthenticated(request)) {
        return new Response(JSON.stringify({ 
            success: false,
            message: "دسترسی غیرمجاز - ورود ادمین لازم است" 
        }), { 
            status: 401,
            headers: { 
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*' 
            }
        });
    }

    try {
        const { results } = await env.honor_sales_db.prepare(
            "SELECT * FROM sales ORDER BY created_at DESC LIMIT 500"
        ).all();
        
        return new Response(JSON.stringify({ 
            success: true,
            count: results?.length || 0,
            data: results || []
        }), { 
            headers: { 
                'Content-Type': 'application/json; charset=utf-8', 
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ 
            success: false,
            message: `خطا در بازیابی داده‌ها: ${error.message}` 
        }), { 
            status: 500,
            headers: { 
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*' 
            }
        });
    }
});

// 4. مسیر دانلود خروجی Excel (CSV) - فقط برای ادمین  
router.get('/api/sales/export', async (request: IRequest, env: Env) => {
    if (!isAdminAuthenticated(request)) {
        return new Response(JSON.stringify({ 
            success: false,
            message: "دسترسی غیرمجاز - ورود ادمین لازم است" 
        }), { 
            status: 401,
            headers: { 
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*' 
            }
        });
    }

    try {
        const { results } = await env.honor_sales_db.prepare(
            "SELECT * FROM sales ORDER BY created_at DESC"
        ).all();
        
        if (!results || results.length === 0) {
            return new Response('ID,Seller ID,IMEI,Model,Sale Date,City,Phone Number,Store Name,Registration Date\n', { 
                headers: { 
                    'Content-Type': 'text/csv; charset=utf-8', 
                    'Content-Disposition': 'attachment; filename="honor_sales_export_empty.csv"',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
                }
            });
        }

        // تبدیل JSON به CSV با encoding مناسب (با store_name)
        let csv = "ID,Seller ID,IMEI,Model,Sale Date,City,Phone Number,Store Name,Registration Date\n";
        results.forEach((row: any) => {
            csv += `"${row.id}","${row.seller_id}","${row.imei}","${row.phone_model}","${row.sale_date}","${row.city || ''}","${row.phone_number || ''}","${row.store_name || ''}","${row.created_at}"\n`;
        });

        return new Response(csv, { 
            headers: { 
                'Content-Type': 'text/csv; charset=utf-8', 
                'Content-Disposition': 'attachment; filename="honor_sales_export.csv"',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ 
            success: false,
            message: `خطا در تولید فایل CSV: ${error.message}` 
        }), { 
            status: 500,
            headers: { 
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*' 
            }
        });
    }
});

// 5. مسیر حذف همه داده‌ها (فقط برای ادمین)
router.delete('/api/admin/delete-all', async (request: IRequest, env: Env) => {
    if (!isAdminAuthenticated(request)) {
        return new Response(JSON.stringify({ 
            success: false,
            message: "دسترسی غیرمجاز - ورود ادمین لازم است" 
        }), { 
            status: 401,
            headers: { 
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*' 
            }
        });
    }

    try {
        const result = await env.honor_sales_db.prepare("DELETE FROM sales").run();
        
        return new Response(JSON.stringify({ 
            success: true,
            message: "تمام داده‌ها با موفقیت حذف شدند",
            deletedCount: result.changes
        }), { 
            headers: { 
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ 
            success: false,
            message: `خطا در حذف داده‌ها: ${error.message}` 
        }), { 
            status: 500,
            headers: { 
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*' 
            }
        });
    }
});

// 6. مدیریت مسیرهای نامشخص
router.all('*', () => new Response(JSON.stringify({ 
    success: false,
    message: "مسیر یافت نشد" 
}), { 
    status: 404,
    headers: { 
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*' 
    }
}));

// تابع fetch اصلی Worker
export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        // پاسخ OPTIONS برای CORS
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, X-Seller-ID, Authorization',
                    'Access-Control-Max-Age': '86400',
                },
            });
        }

        try {
            return router.handle(request, env, ctx);
        } catch (error: any) {
            console.error('Worker error:', error);
            return new Response(JSON.stringify({ 
                success: false,
                message: `خطای عمومی Worker: ${error.message}` 
            }), { 
                status: 500,
                headers: { 
                    'Content-Type': 'application/json; charset=utf-8',
                    'Access-Control-Allow-Origin': '*' 
                }
            });
        }
    },
    // تعریف Durable Object
    IMEI_Manager: IMEI_Manager,
};