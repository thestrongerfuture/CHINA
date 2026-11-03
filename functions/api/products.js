export async function onRequestGet(context) {
  const env = context.env;
  const request = context.request;
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const brand = url.searchParams.get('brand');
    const category = url.searchParams.get('category');
    const search = url.searchParams.get('search');

    // إذا طُلب منتج واحد
    if (id) {
      const stmt = env.DB.prepare('SELECT id, name, brand, category, price, stock, image_url, description, created_at FROM products WHERE id = ?');
      const result = await stmt.bind(id).first();
      if (!result) {
        return new Response(JSON.stringify({ ok: false, error: 'المنتج غير موجود' }), {
          status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
      return new Response(JSON.stringify({ ok: true, product: result }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    // قائمة المنتجات مع فلاتر
    let sql = 'SELECT id, name, brand, category, price, stock, image_url, description, created_at FROM products WHERE is_hidden = 0';
    const params = [];

    if (brand) { sql += ' AND brand = ?'; params.push(brand); }
    if (category) { sql += ' AND category = ?'; params.push(category); }
    if (search) { sql += ' AND name LIKE ?'; params.push('%' + search + '%'); }

    sql += ' ORDER BY id ASC';

    const stmt = env.DB.prepare(sql);
    const result = params.length ? await stmt.bind(...params).all() : await stmt.all();

    const brandsStmt = env.DB.prepare('SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL AND is_hidden = 0 ORDER BY brand');
    const categoriesStmt = env.DB.prepare('SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND is_hidden = 0 ORDER BY category');

    const [brandsRes, categoriesRes] = await Promise.all([brandsStmt.all(), categoriesStmt.all()]);

    return new Response(JSON.stringify({
      ok: true,
      count: result.results.length,
      products: result.results,
      brands: brandsRes.results.map(r => r.brand),
      categories: categoriesRes.results.map(r => r.category)
    }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
}
