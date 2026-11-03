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
        `SELECT oi.*, p.name, p.price as product_price 
         FROM order_items oi 
         LEFT JOIN products p ON p.id = oi.product_id 
         WHERE oi.order_id = ?`
      ).bind(id).all();

      return new Response(JSON.stringify({ ok: true, order: { ...order, items: items.results || [] } }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    // ---------- POST: إضافة طلب جديد، تأكيد، أو تعديل ----------
    if (method === 'POST') {
      const body = await request.json();
      const { action } = body;

      // 1. إضافة طلب جديد
      if (action === 'add' || !action) {
        const { customer_name, customer_phone, customer_address, total, items } = body;
        if (!customer_name || !customer_phone || !items || items.length === 0) {
          return jsonError('البيانات ناقصة', 400);
        }

        const insertOrder = env.DB.prepare(
          'INSERT INTO orders (customer_name, customer_phone, customer_address, total, status, is_confirmed) VALUES (?, ?, ?, ?, ?, 0)'
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

      // 2. تأكيد الطلب النهائي (من قبل الزبون)
      if (action === 'confirm') {
        const { order_id } = body;
        if (!order_id) return jsonError('معرف الطلب مطلوب', 400);

        const result = await env.DB.prepare(
          "UPDATE orders SET is_confirmed = 1 WHERE id = ? AND status = 'pending' AND is_confirmed = 0"
        ).bind(order_id).run();

        if (!result.success || result.meta.changes === 0) {
          return jsonError('لم يتم تأكيد الطلب (ربما تم تأكيده أو تعديله بالفعل)', 400);
        }

        return new Response(JSON.stringify({ ok: true, message: 'تم تأكيد الطلب' }), {
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
      }

      // 3. تعديل الطلب (من قبل الزبون قبل التأكيد)
      if (action === 'edit') {
        const { order_id, items } = body;
        if (!order_id || !items || items.length === 0) return jsonError('البيانات ناقصة', 400);

        // التحقق من أن الطلب لا يزال pending ولم يتم تأكيده
        const order = await env.DB.prepare('SELECT id, status, is_confirmed FROM orders WHERE id = ?').bind(order_id).first();
        if (!order) return jsonError('الطلب غير موجود', 404);
        if (order.status !== 'pending' || order.is_confirmed === 1) {
          return jsonError('لا يمكن تعديل الطلب (تم تأكيده أو الموافقة عليه)', 400);
        }

        // حذف العناصر القديمة وإضافة الجديدة
        await env.DB.prepare('DELETE FROM order_items WHERE order_id = ?').bind(order_id).run();
        
        let total = 0;
        const stmts = items.map(item => {
          total += item.price * item.quantity;
          return env.DB.prepare('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)')
            .bind(order_id, item.product_id, item.quantity, item.price);
        });
        await env.DB.batch(stmts);

        // تحديث الإجمالي
        await env.DB.prepare('UPDATE orders SET total = ? WHERE id = ?').bind(total, order_id).run();

        return new Response(JSON.stringify({ ok: true, message: 'تم تحديث الطلب' }), {
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
