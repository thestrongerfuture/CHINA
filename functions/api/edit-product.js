export async function onRequestPost(context) {
  const { env, request } = context;

  try {
    // التحقق من كلمة المرور
    const authHeader = request.headers.get('X-Admin-Password') || '';
    const passRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_password'").first();
    if (!passRow || authHeader !== passRow.value) {
      return jsonError('كلمة المرور غير صحيحة', 401);
    }

    // استقبال البيانات
    const body = await request.json();
    const { id, name, price, stock, description, created_at } = body;

    if (!id || !name || isNaN(price)) {
      return jsonError('الحقول المطلوبة ناقصة', 400);
    }

    // تحديث المنتج
    let sql = 'UPDATE products SET name = ?, price = ?, stock = ?, description = ?';
    const params = [name, price, stock, description || ''];

    if (created_at) {
      sql += ', created_at = ?';
      params.push(created_at);
    }

    sql += ' WHERE id = ?';
    params.push(id);

    const result = await env.DB.prepare(sql).bind(...params).run();

    if (!result.success || result.meta.changes === 0) {
      return jsonError('لم يتم العثور على المنتج', 404);
    }

    return new Response(JSON.stringify({ ok: true, message: 'تم التعديل بنجاح' }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });

  } catch (err) {
    return jsonError('خطأ: ' + err.message, 500);
  }
}

function jsonError(msg, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
