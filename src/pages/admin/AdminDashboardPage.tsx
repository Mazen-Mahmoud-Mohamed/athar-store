import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageMeta } from '@/components/seo/PageMeta'
import { Button } from '@/components/ui/button'
import { getErrorMessage } from '@/lib/errors'
import { adminGetAllCategories } from '@/services/categoryService'
import { adminGetOrders } from '@/services/orderService'
import { adminGetAllProducts } from '@/services/productService'

export function AdminDashboardPage() {
  const [stats, setStats] = useState({
    products: 0,
    categories: 0,
    orders: 0,
    featured: 0,
  })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const [products, categories, orders] = await Promise.all([
          adminGetAllProducts(),
          adminGetAllCategories(),
          adminGetOrders(),
        ])
        if (!active) return
        setStats({
          products: products.length,
          categories: categories.length,
          orders: orders.length,
          featured: products.filter((p) => p.is_featured).length,
        })
      } catch (err) {
        if (!active) return
        setError(getErrorMessage(err, 'تعذر تحميل لوحة التحكم'))
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  const cards = [
    { label: 'المنتجات', value: stats.products, to: '/admin/products' },
    { label: 'التصنيفات', value: stats.categories, to: '/admin/categories' },
    { label: 'الطلبات', value: stats.orders, to: '/admin/orders' },
    { label: 'المميزة', value: stats.featured, to: '/admin/products' },
  ]

  return (
    <>
      <PageMeta title="لوحة التحكم" />
      <div className="space-y-8">
        <div>
          <p className="mb-2 text-xs tracking-[0.25em] text-gold-deep">أثر ADMIN</p>
          <h1 className="font-display text-3xl font-semibold">لوحة التحكم</h1>
          <p className="mt-2 text-sm text-mocha">إدارة متجر أثر عبر Supabase.</p>
        </div>

        {error ? (
          <p className="rounded-md border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((stat) => (
            <Link
              key={stat.label}
              to={stat.to}
              className="rounded-xl border border-taupe/40 bg-card p-5 transition hover:shadow-soft"
            >
              <p className="text-sm text-mocha">{stat.label}</p>
              <p className="mt-2 font-display text-3xl font-semibold">{stat.value}</p>
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/admin/products/new">إضافة منتج</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin/orders">عرض الطلبات</Link>
          </Button>
        </div>
      </div>
    </>
  )
}
