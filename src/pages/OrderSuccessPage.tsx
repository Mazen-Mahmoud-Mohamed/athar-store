import { Link } from 'react-router-dom'
import { BrandLogo } from '@/components/BrandLogo'
import { PageMeta } from '@/components/seo/PageMeta'
import { Button } from '@/components/ui/button'

export function OrderSuccessPage() {
  return (
    <>
      <PageMeta title="تم تأكيد الطلب" />
      <div className="container-athar flex min-h-[60vh] items-center justify-center py-16">
        <div className="max-w-md text-center">
          <BrandLogo imgClassName="mx-auto h-20 w-20" />
          <h1 className="mt-6 font-display text-3xl font-semibold">شكراً لطلبكِ من أثر</h1>
          <p className="mt-3 text-sm leading-7 text-mocha">
            تم استلام طلبك بنجاح. سنتواصل معكِ قريباً لتأكيد التفاصيل والتوصيل.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild>
              <Link to="/products">متابعة التسوق</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/">العودة للرئيسية</Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
