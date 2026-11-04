export async function onRequest(context) {
  const { env, request } = context;
  const method = request.method;

  try {
    // ---------- 1) التحقق من كلمة المرور ----------
    const authHeader = request.headers.get('X-Admin-Password') || '';
    const passRow = await env.DB.prepare(
      "SELECT value FROM settings WHERE key = 'admin_password'"
    ).first();
    const correctPass = passRow ? passRow.value : '';

    if (!correctPass || authHeader !== correctPass) {
      return jsonError('كلمة المرور غير صحيحة', 401);
    }

    // ---------- 2) GET: جلب الطلبات المعلقة ----------
    if (method === 'GET') {
      const status = new URL(request.url).searchParams.get('status') || 'pending';

      const orders = await env.DB.prepare(
        'SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC'
      ).bind(status).all();

      const ordersWithItems = await Promise.all(orders.results.map(async (o) => {
        const items = await env.DB.prepare(
          `SELECT oi.*, 
                  COALESCE(p.name, oi.item_name, 'عرض') as name,
                  COALESCE(p.stock, 9999) as stock
           FROM order_items oi 
           LEFT JOIN products p ON p.id = oi.product_id 
           WHERE oi.order_id = ?`
        ).bind(o.id).all();
        return { ...o, items: items.results };
      }));

      return jsonOk({ orders: ordersWithItems });
    }

    // ---------- 3) POST: إجراء على طلب ----------
    if (method === 'POST') {
      const body = await request.json();
      const { action, order_id, items } = body;

      if (!order_id) return jsonError('order_id مطلوب', 400);

      // الموافقة
      if (action === 'approve') {
        const orderRow = await env.DB.prepare(
          'SELECT * FROM orders WHERE id = ?'
        ).bind(order_id).first();
        if (!orderRow) return jsonError('الطلب غير موجود', 404);
        if (orderRow.status !== 'pending') return jsonError('الطلب ليس معلقاً', 400);

        // إما الكميات المعدلة أو الأصلية
        const orderItems = await env.DB.prepare(
          'SELECT * FROM order_items WHERE order_id = ?'
        ).bind(order_id).all();

        const itemsToUse = items || orderItems.results;

        // التحقق من المخزون
        for (const it of itemsToUse) {
          const p = await env.DB.prepare('SELECT stock, name FROM products WHERE id = ?')
            .bind(it.product_id).first();
          if (!p) return jsonError(`المنتج ${it.product_id} غير موجود`, 400);
          if (p.stock < it.quantity) {
            return jsonError(`المخزون غير كافٍ للمنتج "${p.name}" (المطلوب: ${it.quantity}, المتاح: ${p.stock})`, 400);
          }
        }

        // تنفيذ التحديثات (batch)
        const stmts = [];
        for (const it of itemsToUse) {
          stmts.push(env.DB.prepare('UPDATE products SET stock = stock - ? WHERE id = ?')
            .bind(it.quantity, it.product_id));
          stmts.push(env.DB.prepare('UPDATE order_items SET quantity = ? WHERE order_id = ? AND product_id = ?')
            .bind(it.quantity, order_id, it.product_id));
        }
        stmts.push(env.DB.prepare("UPDATE orders SET status = 'approved' WHERE id = ?")
          .bind(order_id));

        await env.DB.batch(stmts);
        return jsonOk({ message: 'تمت الموافقة وخصم المخزون' });
      }

      // الرفض
      if (action === 'reject') {
        const r = await env.DB.prepare(
          "UPDATE orders SET status = 'rejected' WHERE id = ? AND status = 'pending'"
        ).bind(order_id).run();
        if (!r.success || r.meta.changes === 0) return jsonError('لم يتم الرفض (ربما الطلب غير معلق)', 400);
        return jsonOk({ message: 'تم رفض الطلب' });
      }

      return jsonError('إجراء غير معروف', 400);
    }

    return jsonError('طريقة غير مدعومة', 405);
  } catch (err) {
    return jsonError('خطأ: ' + err.message, 500);
  }
}

function jsonOk(data) {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
function jsonError(msg, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
