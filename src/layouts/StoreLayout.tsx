import { Outlet } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'

export function StoreLayout() {
  return (
    <div className="flex min-h-dvh flex-col surface-paper">
      <a href="#main-content" className="skip-link">
        تخطي إلى المحتوى الرئيسي
      </a>
      <Header />
      <main id="main-content" className="flex-1" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
