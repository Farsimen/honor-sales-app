
// src/imei_manager.ts

export class IMEI_Manager {
    constructor(state, env) {
        this.state = state;
    }
    
    async fetch(request) {
        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }
        
        try {
            const { imei } = await request.json();
            
            if (!imei) {
                return new Response(JSON.stringify({ success: false, message: "IMEI is required." }), { status: 400 });
            }

            // بررسی و قفل کردن IMEI به صورت اتمیک
            const isRecorded = await this.state.storage.get(imei);

            if (isRecorded) {
                return new Response(JSON.stringify({ success: false, message: `IMEI ${imei} is already registered.` }), { status: 409 });
            }

            await this.state.storage.put(imei, true);
            return new Response(JSON.stringify({ success: true, message: "IMEI locked successfully." }), { status: 200 });

        } catch (error) {
            return new Response(JSON.stringify({ success: false, message: "Internal DO error." }), { status: 500 });
        }
    }
}
