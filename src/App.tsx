import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/features/admin/AuthProvider'
import { AdminRouteGuard } from '@/features/admin/AdminRouteGuard'
import { CartProvider } from '@/features/cart/CartProvider'
import { StoreLayout } from '@/layouts/StoreLayout'
import { AdminLayout } from '@/layouts/AdminLayout'
import { HomePage } from '@/pages/HomePage'
import { ProductsPage } from '@/pages/ProductsPage'
import { ProductDetailsPage } from '@/pages/ProductDetailsPage'
import { CategoryPage } from '@/pages/CategoryPage'
import { CartPage } from '@/pages/CartPage'
import { CheckoutPage } from '@/pages/CheckoutPage'
import { OrderSuccessPage } from '@/pages/OrderSuccessPage'
import { AdminLoginPage } from '@/pages/admin/AdminLoginPage'

const AdminDashboardPage = lazy(() =>
  import('@/pages/admin/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })),
)
const AdminProductsPage = lazy(() =>
  import('@/pages/admin/AdminProductsPage').then((m) => ({ default: m.AdminProductsPage })),
)
const AdminProductFormPage = lazy(() =>
  import('@/pages/admin/AdminProductFormPage').then((m) => ({ default: m.AdminProductFormPage })),
)
const AdminCategoriesPage = lazy(() =>
  import('@/pages/admin/AdminCategoriesPage').then((m) => ({ default: m.AdminCategoriesPage })),
)
const AdminOrdersPage = lazy(() =>
  import('@/pages/admin/AdminOrdersPage').then((m) => ({ default: m.AdminOrdersPage })),
)
const AdminOrderDetailsPage = lazy(() =>
  import('@/pages/admin/AdminOrderDetailsPage').then((m) => ({ default: m.AdminOrderDetailsPage })),
)

function AdminFallback() {
  return (
    <div className="rounded-xl border border-taupe/40 bg-card p-8 text-sm text-mocha">
      جاري تحميل لوحة الإدارة...
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <Routes>
            <Route element={<StoreLayout />}>
              <Route index element={<HomePage />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="products/:id" element={<ProductDetailsPage />} />
              <Route path="category/:slug" element={<CategoryPage />} />
              <Route path="cart" element={<CartPage />} />
              <Route path="checkout" element={<CheckoutPage />} />
              <Route path="order-success" element={<OrderSuccessPage />} />
            </Route>

            <Route path="admin/login" element={<AdminLoginPage />} />

            <Route path="admin" element={<AdminRouteGuard />}>
              <Route element={<AdminLayout />}>
                <Route
                  index
                  element={
                    <Suspense fallback={<AdminFallback />}>
                      <AdminDashboardPage />
                    </Suspense>
                  }
                />
                <Route
                  path="products"
                  element={
                    <Suspense fallback={<AdminFallback />}>
                      <AdminProductsPage />
                    </Suspense>
                  }
                />
                <Route
                  path="products/new"
                  element={
                    <Suspense fallback={<AdminFallback />}>
                      <AdminProductFormPage />
                    </Suspense>
                  }
                />
                <Route
                  path="products/:id/edit"
                  element={
                    <Suspense fallback={<AdminFallback />}>
                      <AdminProductFormPage />
                    </Suspense>
                  }
                />
                <Route
                  path="categories"
                  element={
                    <Suspense fallback={<AdminFallback />}>
                      <AdminCategoriesPage />
                    </Suspense>
                  }
                />
                <Route
                  path="orders"
                  element={
                    <Suspense fallback={<AdminFallback />}>
                      <AdminOrdersPage />
                    </Suspense>
                  }
                />
                <Route
                  path="orders/:id"
                  element={
                    <Suspense fallback={<AdminFallback />}>
                      <AdminOrderDetailsPage />
                    </Suspense>
                  }
                />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster
            position="top-center"
            richColors
            dir="rtl"
            toastOptions={{
              classNames: {
                toast: 'font-sans',
              },
            }}
          />
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
