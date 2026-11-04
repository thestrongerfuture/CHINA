export async function onRequest(context) {
  const { env, request } = context;
  const method = request.method;

  try {
    // ---------- التحقق من كلمة المرور (لعمليات الإدارة) ----------
    if (method === 'POST') {
      const authHeader = request.headers.get('X-Admin-Password') || '';
      const passRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_password'").first();
      if (!passRow || authHeader !== passRow.value) {
        return jsonError('كلمة المرور غير صحيحة', 401);
      }
    }

    // ---------- GET: جلب العروض (مع حساب السعر النهائي) ----------
    if (method === 'GET') {
      const offersResult = await env.DB.prepare(
        'SELECT * FROM offers ORDER BY created_at DESC'
      ).all();
      const offers = offersResult.results || [];

      for (const offer of offers) {
        const items = await env.DB.prepare(
          `SELECT oi.*, p.name as product_name, p.price as product_price, p.stock as product_stock
           FROM offer_items oi
           JOIN products p ON p.id = oi.product_id
           WHERE oi.offer_id = ?`
        ).bind(offer.id).all();
        offer.items = items.results || [];

        // حساب السعر الأصلي
        let originalTotal = 0;
        offer.items.forEach(item => {
          originalTotal += item.product_price * item.quantity;
        });
        offer.original_total = originalTotal;

        // حساب السعر النهائي (إذا كان هناك سعر يدوي، نستخدمه. وإلا نستخدم الخصم)
        if (offer.manual_price && offer.manual_price > 0) {
          offer.final_price = offer.manual_price;
        } else if (offer.discount_percent > 0) {
          const discountAmount = originalTotal * (offer.discount_percent / 100);
          offer.final_price = originalTotal - discountAmount;
        } else {
          offer.final_price = originalTotal;
        }

        // حساب نسبة الخصم الفعلية (للعرض للزبون)
        if (originalTotal > 0) {
          offer.actual_discount_percent = ((originalTotal - offer.final_price) / originalTotal) * 100;
        } else {
          offer.actual_discount_percent = 0;
        }
      }

      return new Response(JSON.stringify({ ok: true, offers }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    // ---------- POST: إضافة، تعديل، أو حذف عرض ----------
    if (method === 'POST') {
      const body = await request.json();
      const { action } = body;

      // 1. إضافة عرض
      if (action === 'add') {
        const { title, discount_percent, manual_price, items } = body;
        if (!title || !items || items.length === 0) {
          return jsonError('العنوان والمنتجات مطلوبة', 400);
        }

        const insertOffer = env.DB.prepare(
          'INSERT INTO offers (title, discount_percent, manual_price) VALUES (?, ?, ?)'
        ).bind(title, discount_percent || 0, manual_price || null);
        const result = await insertOffer.run();
        if (!result.success) return jsonError('فشل إنشاء العرض', 500);
        const offerId = result.meta.last_row_id;

        const stmts = items.map(item =>
          env.DB.prepare('INSERT INTO offer_items (offer_id, product_id, quantity) VALUES (?, ?, ?)')
            .bind(offerId, item.product_id, item.quantity)
        );
        await env.DB.batch(stmts);

        return new Response(JSON.stringify({ ok: true, offer_id: offerId, message: 'تم إضافة العرض' }), {
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
      }

      // 2. تعديل عرض
      if (action === 'edit') {
        const { offer_id, title, discount_percent, manual_price, items } = body;
        if (!offer_id || !title || !items || items.length === 0) {
          return jsonError('البيانات ناقصة', 400);
        }

        await env.DB.prepare(
          'UPDATE offers SET title = ?, discount_percent = ?, manual_price = ? WHERE id = ?'
        ).bind(title, discount_percent || 0, manual_price || null, offer_id).run();

        await env.DB.prepare('DELETE FROM offer_items WHERE offer_id = ?').bind(offer_id).run();

        const stmts = items.map(item =>
          env.DB.prepare('INSERT INTO offer_items (offer_id, product_id, quantity) VALUES (?, ?, ?)')
            .bind(offer_id, item.product_id, item.quantity)
        );
        await env.DB.batch(stmts);

        return new Response(JSON.stringify({ ok: true, message: 'تم تعديل العرض' }), {
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
      }

      // 3. حذف عرض
      if (action === 'delete') {
        const { offer_id } = body;
        if (!offer_id) return jsonError('معرف العرض مطلوب', 400);

        await env.DB.prepare('DELETE FROM offer_items WHERE offer_id = ?').bind(offer_id).run();
        await env.DB.prepare('DELETE FROM offers WHERE id = ?').bind(offer_id).run();

        return new Response(JSON.stringify({ ok: true, message: 'تم حذف العرض' }), {
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
      }

      return jsonError('إجراء غير معروف', 400);
    }

    return jsonError('طريقة غير مدعومة', 405);
  } catch (err) {
    return jsonError('خطأ: ' + err.message, 500);
  }
}

function jsonError(msg, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
