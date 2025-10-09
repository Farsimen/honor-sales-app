import { IRequest, Router } from 'itty-router';

export interface Env {
    IMEI_MANAGER: DurableObjectNamespace;
    honor_sales_db: D1Database;
}

const ADMIN_PASSWORD = "Honor2025Admin!";

function isAdminAuthenticated(request: Request): boolean {
    const auth = request.headers.get('Authorization');
    const adminPassword = request.headers.get('X-Admin-Password');
    return auth === `Bearer ${ADMIN_PASSWORD}` || adminPassword === ADMIN_PASSWORD;
}

export class IMEI_Manager {
    state: DurableObjectState;
    env: Env;

    constructor(state: DurableObjectState, env: Env) {
        this.state = state;
        this.env = env;
    }
    
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'POST') {
            try {
                const sellerId = request.headers.get('X-Seller-ID') || 'seller-001';
                const data: any = await request.json();
                
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
                
                const saleId = `sale-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const statement = this.env.honor_sales_db.prepare(
                    "INSERT INTO sales (id, seller_id, imei, phone_model, sale_date, city, phone_number, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
                );

                const result = await statement.bind(
                    saleId,
                    sellerId,
                    data.imei,
                    data.phone_model || 'نامشخص',
                    data.sale_date || new Date().toISOString().split('T')[0],
                    data.city || null,
                    data.phone_number || null,
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
                        'Access-Control-Allow-Headers': 'Content-Type, X-Seller-ID, Authorization, X-Admin-Password'
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

const router = Router();

router.get('/', () => {
    return new Response(JSON.stringify({ 
        message: "Honor Sales Worker API v2.0 - Final",
        status: "active",
        timestamp: new Date().toISOString(),
        endpoints: [
            "POST /api/sales/register",
            "GET /api/sales/data", 
            "GET /api/admin/export",
            "DELETE /api/admin/clear"
        ]
    }), { 
        headers: { 
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*' 
        }
    });
});

router.post('/api/sales/register', async (request: IRequest, env: Env) => {
    try {
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

router.get('/api/sales/data', async (request: IRequest, env: Env) => {
    if (!isAdminAuthenticated(request)) {
        return new Response(JSON.stringify({ 
            success: false,
            message: "دسترسی غیرمجاز - ورود ادمین لازم است" 
        }), { 
            status: 401,
            headers: { 
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Authorization, X-Admin-Password'
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
                'Access-Control-Allow-Headers': 'Authorization, X-Admin-Password'
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

router.get('/api/admin/export', async (request: IRequest, env: Env) => {
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
            return new Response('شناسه,کد فروشنده,IMEI,مدل,تاریخ فروش,شهر,شماره تماس,تاریخ ثبت\n', { 
                headers: { 
                    'Content-Type': 'text/csv; charset=utf-8-bom', 
                    'Content-Disposition': 'attachment; filename="honor_sales_empty.csv"',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Authorization, X-Admin-Password'
                }
            });
        }

        let csv = '\uFEFFشناسه,کد فروشنده,IMEI,مدل,تاریخ فروش,شهر,شماره تماس,تاریخ ثبت\n';
        results.forEach((row: any) => {
            csv += `"${row.id}","${row.seller_id}","${row.imei}","${row.phone_model}","${row.sale_date}","${row.city || ''}","${row.phone_number || ''}","${new Date(row.created_at).toLocaleDateString('fa-IR')}"\n`;
        });

        return new Response(csv, { 
            headers: { 
                'Content-Type': 'text/csv; charset=utf-8-bom', 
                'Content-Disposition': 'attachment; filename="honor_sales_export.csv"',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Authorization, X-Admin-Password'
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

router.delete('/api/admin/clear', async (request: IRequest, env: Env) => {
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
                'Access-Control-Allow-Headers': 'Authorization, X-Admin-Password'
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

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, X-Seller-ID, Authorization, X-Admin-Password',
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
    IMEI_Manager: IMEI_Manager,
};