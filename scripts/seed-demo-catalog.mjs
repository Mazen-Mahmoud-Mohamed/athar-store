/**
 * Idempotent demo catalog seed for أثر / athar.
 * Uses anon key + admin session only (RLS). Never uses service_role.
 *
 * Auth (one of):
 * - ATHAR_SEED_EMAIL + ATHAR_SEED_PASSWORD
 * - SUPABASE_ACCESS_TOKEN (+ optional SUPABASE_REFRESH_TOKEN)
 *
 * Loads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env.local
 */
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const productsDir = path.join(root, 'products')
const inventoryPath = path.join(productsDir, 'inventory.json')

function loadEnvLocal() {
  const envPath = path.join(root, '.env.local')
  if (!existsSync(envPath)) throw new Error('.env.local missing')
  const out = {}
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const i = trimmed.indexOf('=')
    if (i === -1) continue
    out[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
  }
  return out
}

function fileKey(filename) {
  return createHash('sha1').update(filename).digest('hex').slice(0, 12)
}

function productSlug(filename) {
  return `demo-${fileKey(filename)}`
}

const CATEGORIES = [
  {
    name: 'حقائب يد',
    slug: 'handbags',
    description: 'حقائب يد منسوجة بتفاصيل ذهبية أنيقة — مجموعة أثر التجريبية',
    sort_order: 1,
  },
  {
    name: 'حقائب كتف',
    slug: 'shoulder-bags',
    description: 'حقائب كتف وسلاسل ذهبية لإطلالة يومية راقية',
    sort_order: 2,
  },
  {
    name: 'شنط توت',
    slug: 'totes',
    description: 'شنط توت مربعة بحرف يدوي ولمسات ناعمة',
    sort_order: 3,
  },
  {
    name: 'حقائب سهرة',
    slug: 'evening-bags',
    description: 'حقائب سهرة بلمعات معدنية لإطلالات المناسبات',
    sort_order: 4,
  },
]

/** Demo product definitions keyed by source filename. */
const PRODUCTS = [
  {
    file: 'WhatsApp Image 2026-10-03 at 1.43.09 AM.jpeg',
    name: 'حقيبة يد منسوجة بني وبيج',
    description: 'حقيبة نسائية منسوجة بنقشة شيفرون دافئة، بمقبض علوي وسلسلة ذهبية — بيانات تجريبية قابلة للتعديل.',
    category: 'handbags',
    price: 1650,
    old_price: 1890,
    stock: 7,
    is_featured: true,
    is_new: true,
    is_active: true,
    group: false,
  },
  {
    file: 'WhatsApp Image 2026-10-03 at 1.43.10 AM.jpeg',
    name: 'حقيبة يد كحلي وكريمي مع وشاح',
    description: 'حقيبة منسوجة بألوان كحلي وكريمي مع وشاح زهور ولمسات ذهبية.',
    category: 'handbags',
    price: 1720,
    old_price: null,
    stock: 5,
    is_featured: true,
    is_new: false,
    is_active: true,
    group: false,
  },
  {
    file: 'WhatsApp Image 2026-10-03 at 1.43.10 AM (1).jpeg',
    name: 'حقيبة يد مخططة رمادي مع وشاح أخضر',
    description: 'حقيبة منسوجة بخطوط رمادية ووشاح نباتي أخضر لإطلالة هادئة.',
    category: 'handbags',
    price: 1590,
    old_price: 1750,
    stock: 10,
    is_featured: false,
    is_new: true,
    is_active: true,
    group: false,
  },
  {
    file: 'WhatsApp Image 2026-10-03 at 1.43.10 AM (2).jpeg',
    name: 'حقيبة منسوجة كحلي معروضة',
    description: 'حقيبة منسوجة كحلي وكريمي من جلسة تصوير المتجر — يُرجى مراجعة بيانات العلامة قبل النشر النهائي.',
    category: 'handbags',
    price: 1680,
    old_price: null,
    stock: 4,
    is_featured: false,
    is_new: false,
    is_active: true,
    group: false,
  },
  {
    file: 'WhatsApp Image 2026-10-03 at 1.43.11 AM.jpeg',
    name: 'حقيبة يد بني إسبريسو مع وشاح',
    description: 'حقيبة منسوجة بدرجات البني الدافئ ووشاح أخضر ولمعة ذهبية.',
    category: 'handbags',
    price: 1790,
    old_price: 2050,
    stock: 6,
    is_featured: true,
    is_new: true,
    is_active: true,
    group: false,
  },
  {
    file: 'WhatsApp Image 2026-10-03 at 1.48.44 AM.jpeg',
    name: 'تشكيلة شنط توت مربعة (مسودة)',
    description: 'صورة جماعية لشنط توت بألوان متعددة — مسودة تجريبية غير ظاهرة للعامة حتى المراجعة.',
    category: 'totes',
    price: 1250,
    old_price: null,
    stock: 3,
    is_featured: false,
    is_new: false,
    is_active: false,
    group: true,
  },
  {
    file: 'WhatsApp Image 2026-10-03 at 1.48.45 AM.jpeg',
    name: 'مجموعة حقائب صندوقية مخططة (مسودة)',
    description: 'صورة جماعية لحقائبين منسوجتين بألوان مختلفة — مسودة للمراجعة.',
    category: 'handbags',
    price: 1550,
    old_price: null,
    stock: 3,
    is_featured: false,
    is_new: false,
    is_active: false,
    group: true,
  },
  {
    file: 'WhatsApp Image 2026-10-03 at 1.48.47 AM.jpeg',
    name: 'حقيبة يد منسوجة بثلاثة ألوان دافئة',
    description: 'حقيبة منسوجة بدرجات البني والكريمي مع قفل ملتوٍ وسلسلة ذهبية.',
    category: 'handbags',
    price: 1620,
    old_price: null,
    stock: 8,
    is_featured: false,
    is_new: true,
    is_active: true,
    group: false,
  },
  {
    file: 'WhatsApp Image 2026-10-03 at 1.48.48 AM.jpeg',
    name: 'حقيبة يد سوداء وكريمي مع وشاح',
    description: 'حقيبة منسوجة بلون أسود وخطوط كريمية ووشاح بطابع كلاسيكي.',
    category: 'handbags',
    price: 1690,
    old_price: 1920,
    stock: 5,
    is_featured: true,
    is_new: false,
    is_active: true,
    group: false,
  },
  {
    file: 'WhatsApp Image 2026-10-03 at 1.51.12 AM.jpeg',
    name: 'حقيبة يد سوداء منسوجة كلاسيكية',
    description: 'حقيبة سوداء منسوجة بالكامل مع قفل ذهبي وسلسلة كتف.',
    category: 'handbags',
    price: 1480,
    old_price: null,
    stock: 12,
    is_featured: false,
    is_new: false,
    is_active: true,
    group: false,
  },
  {
    file: 'WhatsApp Image 2026-10-03 at 1.51.12 AM (1).jpeg',
    name: 'حقيبة يد بورغندي مبطنة مع وشاح',
    description: 'حقيبة صغيرة بلون بورغندي الفاخر مع وشاح ناعم ولمسات ذهبية.',
    category: 'handbags',
    price: 1380,
    old_price: 1550,
    stock: 7,
    is_featured: false,
    is_new: true,
    is_active: true,
    group: false,
  },
  {
    file: 'WhatsApp Image 2026-10-03 at 1.51.13 AM.jpeg',
    name: 'حقيبة كتف لامعة أسود وذهبي',
    description: 'حقيبة سهرة منسوجة بخيوط معدنية ذهبية وسلاسل كتف مزدوجة.',
    category: 'evening-bags',
    price: 2450,
    old_price: 2790,
    stock: 4,
    is_featured: true,
    is_new: true,
    is_active: true,
    group: false,
  },
  {
    file: 'WhatsApp Image 2026-10-03 at 1.51.13 AM (1).jpeg',
    name: 'حقيبة سهرة رمادي لامع',
    description: 'حقيبة مضلعة بلمعان فضي أنيق — بيانات تجريبية؛ راجعي حقوق الصورة قبل النشر النهائي.',
    category: 'evening-bags',
    price: 2350,
    old_price: null,
    stock: 5,
    is_featured: false,
    is_new: true,
    is_active: true,
    group: false,
  },
  {
    file: 'WhatsApp Image 2026-10-03 at 1.51.13 AM (2).jpeg',
    name: 'حقيبة يد زيتونية منسوجة',
    description: 'حقيبة منسوجة بلون زيتوني راقٍ مع قفل وسلسلة ذهبية.',
    category: 'handbags',
    price: 1750,
    old_price: 1980,
    stock: 6,
    is_featured: true,
    is_new: false,
    is_active: true,
    group: false,
  },
  {
    file: 'WhatsApp Image 2026-10-03 at 1.51.13 AM (3).jpeg',
    name: 'مجموعة حقائب سوداء كلاسيكية (مسودة)',
    description: 'صورة جماعية لثلاث حقائب سوداء — مسودة غير ظاهرة في المتجر حتى الفصل والمراجعة.',
    category: 'handbags',
    price: 1850,
    old_price: null,
    stock: 3,
    is_featured: false,
    is_new: false,
    is_active: false,
    group: true,
  },
  {
    file: 'WhatsApp Image 2026-10-03 at 1.51.14 AM.jpeg',
    name: 'حقيبة يد بورغندي مضلعة مع فيونكة',
    description: 'حقيبة مضلعة بلون النبيذ مع وشاح زهور وفيونكة ناعمة.',
    category: 'handbags',
    price: 1520,
    old_price: null,
    stock: 9,
    is_featured: false,
    is_new: true,
    is_active: true,
    group: false,
  },
  {
    file: 'WhatsApp Image 2026-10-03 at 1.51.14 AM (1).jpeg',
    name: 'حقيبة كتف تراكوتا كلاسيكية',
    description: 'حقيبة منسوجة بلون ترابي دافئ وقفل ذهبي مزخرف وسلسلة كتف.',
    category: 'shoulder-bags',
    price: 1580,
    old_price: 1740,
    stock: 8,
    is_featured: false,
    is_new: false,
    is_active: true,
    group: false,
  },
  {
    file: 'WhatsApp Image 2026-10-03 at 1.51.14 AM (2).jpeg',
    name: 'حقيبة يد سوداء مضفرة',
    description: 'حقيبة سوداء بنسيج مضفر وقفل مثلثي ذهبي وسلسلة كتف.',
    category: 'handbags',
    price: 1490,
    old_price: null,
    stock: 10,
    is_featured: false,
    is_new: false,
    is_active: true,
    group: false,
  },
  {
    file: 'WhatsApp Image 2026-10-03 at 1.51.14 AM (3).jpeg',
    name: 'حقيبة يد سوداء بخطوط بيج',
    description: 'حقيبة منسوجة سوداء مع أشرطة بيج وقفل ذهبي أنيق.',
    category: 'handbags',
    price: 1670,
    old_price: 1890,
    stock: 7,
    is_featured: true,
    is_new: false,
    is_active: true,
    group: false,
  },
]

async function ensureAuth(supabase, env) {
  const access = process.env.SUPABASE_ACCESS_TOKEN
  if (access) {
    const { data, error } = await supabase.auth.setSession({
      access_token: access,
      refresh_token: process.env.SUPABASE_REFRESH_TOKEN || access,
    })
    if (error) throw error
    return data.session
  }

  const email = process.env.ATHAR_SEED_EMAIL || env.ATHAR_SEED_EMAIL
  const password = process.env.ATHAR_SEED_PASSWORD || env.ATHAR_SEED_PASSWORD
  if (!email || !password) {
    throw new Error(
      'Missing admin auth. Set ATHAR_SEED_EMAIL + ATHAR_SEED_PASSWORD, or SUPABASE_ACCESS_TOKEN.',
    )
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.session
}

async function upsertCategories(supabase) {
  const map = {}
  for (const cat of CATEGORIES) {
    const { data: existing, error: findError } = await supabase
      .from('categories')
      .select('*')
      .eq('slug', cat.slug)
      .maybeSingle()
    if (findError) throw findError

    if (existing) {
      const { data, error } = await supabase
        .from('categories')
        .update({
          name: cat.name,
          description: cat.description,
          sort_order: cat.sort_order,
          is_active: true,
        })
        .eq('id', existing.id)
        .select('*')
        .single()
      if (error) throw error
      map[cat.slug] = data
      console.log(`category upserted: ${cat.slug}`)
    } else {
      const { data, error } = await supabase
        .from('categories')
        .insert({
          name: cat.name,
          slug: cat.slug,
          description: cat.description,
          sort_order: cat.sort_order,
          is_active: true,
        })
        .select('*')
        .single()
      if (error) throw error
      map[cat.slug] = data
      console.log(`category created: ${cat.slug}`)
    }
  }
  return map
}

async function uploadProductImage(supabase, productId, absolutePath, filename) {
  const buffer = readFileSync(absolutePath)
  const objectPath = `products/${productId}/demo-${fileKey(filename)}.jpg`
  const { error: uploadError } = await supabase.storage.from('product-images').upload(objectPath, buffer, {
    contentType: 'image/jpeg',
    upsert: true,
    cacheControl: '3600',
  })
  if (uploadError) throw uploadError
  const { data } = supabase.storage.from('product-images').getPublicUrl(objectPath)
  return data.publicUrl
}

async function upsertProducts(supabase, categoryMap) {
  const summary = {
    created: 0,
    updated: 0,
    uploaded: 0,
    active: 0,
    inactive: 0,
    group: 0,
    prices: [],
  }

  for (const item of PRODUCTS) {
    const abs = path.join(productsDir, item.file)
    if (!existsSync(abs)) throw new Error(`Missing image: ${item.file}`)
    if (item.old_price != null && item.old_price < item.price) {
      throw new Error(`Invalid demo pricing for ${item.file}`)
    }

    const slug = productSlug(item.file)
    const categoryId = categoryMap[item.category]?.id
    if (!categoryId) throw new Error(`Missing category ${item.category}`)

    const { data: existing, error: findError } = await supabase
      .from('products')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
    if (findError) throw findError

    let product = existing
    const payload = {
      name: item.name,
      slug,
      description: item.description,
      category_id: categoryId,
      price: item.price,
      old_price: item.old_price,
      stock_quantity: item.stock,
      is_active: item.is_active,
      is_featured: item.is_featured,
      is_new: item.is_new,
    }

    if (existing) {
      const { data, error } = await supabase
        .from('products')
        .update(payload)
        .eq('id', existing.id)
        .select('*')
        .single()
      if (error) throw error
      product = data
      summary.updated += 1
      console.log(`product updated: ${slug}`)
    } else {
      const { data, error } = await supabase.from('products').insert(payload).select('*').single()
      if (error) throw error
      product = data
      summary.created += 1
      console.log(`product created: ${slug}`)
    }

    const imageUrl = await uploadProductImage(supabase, product.id, abs, item.file)
    summary.uploaded += 1

    const { error: imageError } = await supabase
      .from('products')
      .update({ image_url: imageUrl })
      .eq('id', product.id)
    if (imageError) throw imageError

    summary.prices.push(item.price)
    if (item.is_active) summary.active += 1
    else summary.inactive += 1
    if (item.group) summary.group += 1
  }

  return summary
}

async function verify(supabase) {
  const { count: catCount, error: cErr } = await supabase
    .from('categories')
    .select('*', { count: 'exact', head: true })
  if (cErr) throw cErr

  const { data: allProducts, error: pErr } = await supabase.from('products').select('id,slug,name,price,old_price,image_url,is_active,category_id')
  if (pErr) throw pErr

  const { data: publicProducts, error: pubErr } = await supabase
    .from('products')
    .select('id,slug,is_active,image_url')
    .eq('is_active', true)
  if (pubErr) throw pubErr

  const missingImage = (allProducts ?? []).filter((p) => !p.image_url)
  const missingCategory = (allProducts ?? []).filter((p) => !p.category_id)
  const badOld = (allProducts ?? []).filter((p) => p.old_price != null && Number(p.old_price) < Number(p.price))
  const inactivePublicLeak = (publicProducts ?? []).filter((p) => p.is_active !== true)

  return {
    categories: catCount ?? 0,
    products: allProducts?.length ?? 0,
    activePublic: publicProducts?.length ?? 0,
    missingImage: missingImage.length,
    missingCategory: missingCategory.length,
    badOldPrice: badOld.length,
    inactivePublicLeak: inactivePublicLeak.length,
  }
}

async function main() {
  const env = loadEnvLocal()
  const url = env.VITE_SUPABASE_URL
  const anon = env.VITE_SUPABASE_ANON_KEY
  if (!url?.includes('rotcgsayspiphcisepmu')) throw new Error('Unexpected Supabase URL (not athar)')
  if (!anon) throw new Error('Missing anon key')

  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const session = await ensureAuth(supabase, env)
  if (!session?.user) throw new Error('No session after auth')

  const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin')
  if (adminError) throw adminError
  if (!isAdmin) throw new Error('Signed-in user is not admin')

  console.log(`admin ok: ${session.user.email}`)

  const categoryMap = await upsertCategories(supabase)
  const summary = await upsertProducts(supabase, categoryMap)
  const checks = await verify(supabase)

  if (existsSync(inventoryPath)) {
    const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'))
    inventory.supabaseCatalogSeeded = true
    inventory.seededAt = new Date().toISOString()
    inventory.seedNote =
      'Demo catalog seeded via scripts/seed-demo-catalog.mjs — edit names/prices in Admin.'
    writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8')
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        categories: Object.keys(categoryMap).length,
        ...summary,
        priceMin: Math.min(...summary.prices),
        priceMax: Math.max(...summary.prices),
        verify: checks,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exit(1)
})
