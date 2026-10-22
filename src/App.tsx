import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { RouteScroll } from '@/components/RouteScroll'
import { AuthProvider } from '@/features/admin/AuthProvider'
import { AdminRouteGuard } from '@/features/admin/AdminRouteGuard'
import { CustomerRouteGuard } from '@/features/account/CustomerRouteGuard'
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
import { ReturnPolicyPage } from '@/pages/ReturnPolicyPage'
import { TermsPage } from '@/pages/TermsPage'
import { PrivacyPolicyPage } from '@/pages/PrivacyPolicyPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { AdminLoginPage } from '@/pages/admin/AdminLoginPage'
import { CustomerAuthPage } from '@/pages/CustomerAuthPage'
import { AccountOrdersPage } from '@/pages/account/AccountOrdersPage'
import { AccountOrderDetailPage } from '@/pages/account/AccountOrderDetailPage'
import { AccountProfilePage } from '@/pages/account/AccountProfilePage'

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

const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

export default function App() {
  return (
    <BrowserRouter basename={routerBasename}>
      <RouteScroll />
      <AuthProvider>
        <CartProvider>
          <Routes>
            {/* Customer auth routes (public) */}
            <Route path="login" element={<CustomerAuthPage mode="login" />} />
            <Route path="register" element={<CustomerAuthPage mode="register" />} />
            <Route path="forgot-password" element={<CustomerAuthPage mode="forgot" />} />
            <Route path="reset-password" element={<CustomerAuthPage mode="reset" />} />
            <Route path="auth/callback" element={<CustomerAuthPage mode="callback" />} />

            <Route element={<StoreLayout />}>
              <Route index element={<HomePage />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="products/:id" element={<ProductDetailsPage />} />
              <Route path="category/:slug" element={<CategoryPage />} />
              <Route path="cart" element={<CartPage />} />
              <Route path="order-success" element={<OrderSuccessPage />} />
              <Route path="return-policy" element={<ReturnPolicyPage />} />
              <Route path="terms" element={<TermsPage />} />
              <Route path="privacy-policy" element={<PrivacyPolicyPage />} />

              {/* Protected customer routes */}
              <Route element={<CustomerRouteGuard />}>
                <Route path="checkout" element={<CheckoutPage />} />
                <Route path="account" element={<AccountOrdersPage />} />
                <Route path="account/profile" element={<AccountProfilePage />} />
                <Route path="account/orders/:id" element={<AccountOrderDetailPage />} />
              </Route>

              {/* Unknown storefront paths — SPA catch-all (GitHub Pages 404.html still boots the app). */}
              <Route path="*" element={<NotFoundPage />} />
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
