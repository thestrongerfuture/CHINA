export async function onRequest(context) {
  const { env, request } = context;
  const method = request.method;

  try {
    // ---------- GET: جلب طلب واحد (للفاتورة) ----------
    if (method === 'GET') {
      const url = new URL(request.url);
      const id = url.searchParams.get('id');
      if (!id) return jsonError('معرف الطلب مطلوب', 400);

      const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
      if (!order) return jsonError('الطلب غير موجود', 404);

      const items = await env.DB.prepare(
        `SELECT oi.*, p.name 
         FROM order_items oi 
         LEFT JOIN products p ON p.id = oi.product_id 
         WHERE oi.order_id = ?`
      ).bind(id).all();

      return new Response(JSON.stringify({ ok: true, order: { ...order, items: items.results || [] } }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    // ---------- POST: إضافة طلب جديد ----------
    if (method === 'POST') {
      const body = await request.json();
      const { customer_name, customer_phone, customer_address, total, items } = body;

      if (!customer_name || !customer_phone || !items || items.length === 0) {
        return jsonError('البيانات ناقصة', 400);
      }

      const insertOrder = env.DB.prepare(
        'INSERT INTO orders (customer_name, customer_phone, customer_address, total, status) VALUES (?, ?, ?, ?, ?)'
      ).bind(customer_name, customer_phone, customer_address || '', total, 'pending');
      const result = await insertOrder.run();
      if (!result.success) return jsonError('فشل إنشاء الطلب', 500);
      const orderId = result.meta.last_row_id;

      const stmts = items.map(item =>
        env.DB.prepare('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)')
          .bind(orderId, item.product_id, item.quantity, item.price)
      );
      await env.DB.batch(stmts);

      return new Response(JSON.stringify({ ok: true, order_id: orderId, message: 'تم حفظ الطلب' }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
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
