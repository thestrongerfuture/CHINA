export async function onRequest(context) {
  const { env, request } = context;

  try {
    const method = request.method;
    
    // ---------- التحقق من كلمة المرور (لعمليات الإدارة) ----------
    if (method === 'POST' || new URL(request.url).searchParams.get('admin') === 'true') {
      const authHeader = request.headers.get('X-Admin-Password') || '';
      const passRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_password'").first();
      if (!passRow || authHeader !== passRow.value) {
        return jsonError('كلمة المرور غير صحيحة', 401);
      }
    }

    // ---------- GET: جلب العروض (للعميل أو للإدارة) ----------
    if (method === 'GET') {
      const isAdmin = new URL(request.url).searchParams.get('admin') === 'true';
      
      let sql = `
        SELECT o.*, p.name as product_name, p.price as original_price, p.stock as product_stock
        FROM offers o
        JOIN products p ON p.id = o.product_id
      `;
      
      // إذا كان للعميل، نفلتر العروض المنتهية
      if (!isAdmin) {
        sql += ' WHERE o.expires_at IS NULL OR o.expires_at > datetime("now")';
      }
      
      sql += ' ORDER BY o.created_at DESC';

      const result = await env.DB.prepare(sql).all();

      return new Response(JSON.stringify({ ok: true, offers: result.results || [] }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    // ---------- POST: إضافة أو حذف عرض ----------
    if (method === 'POST') {
      const body = await request.json();
      const { action } = body;

      if (action === 'add') {
        const { product_id, title, quantity, offer_price } = body;
        if (!product_id || !title || !quantity || !offer_price) {
          return jsonError('جميع الحقول مطلوبة', 400);
        }

        await env.DB.prepare(
          'INSERT INTO offers (title, product_id, quantity, offer_price) VALUES (?, ?, ?, ?)'
        ).bind(title, product_id, quantity, offer_price).run();

        return new Response(JSON.stringify({ ok: true, message: 'تم إضافة العرض' }), {
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
      }

      // ---------- EDIT ----------
      if (action === 'edit') {
        const { offer_id, title, quantity, offer_price } = body;
        if (!offer_id || !title || !quantity || !offer_price) {
          return jsonError('جميع الحقول مطلوبة', 400);
        }

        await env.DB.prepare(
          'UPDATE offers SET title = ?, quantity = ?, offer_price = ? WHERE id = ?'
        ).bind(title, quantity, offer_price, offer_id).run();

        return new Response(JSON.stringify({ ok: true, message: 'تم تعديل العرض' }), {
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
      }

      if (action === 'delete') {
        const { offer_id } = body;
        if (!offer_id) return jsonError('معرف العرض مطلوب', 400);

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
