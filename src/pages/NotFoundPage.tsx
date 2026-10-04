import { Link } from 'react-router-dom'
import { BrandLogo } from '@/components/BrandLogo'
import { PageMeta } from '@/components/seo/PageMeta'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <>
      <PageMeta
        title="الصفحة غير موجودة"
        description="هذه الصفحة غير متاحة في أثر. يمكنكِ العودة للرئيسية أو تصفح المنتجات."
        path="/404"
        noIndex
      />
      <div className="container-athar flex min-h-[62vh] items-center justify-center py-14 sm:py-20">
        <div className="w-full max-w-md text-center">
          <BrandLogo imgClassName="mx-auto h-[4.5rem] w-[4.5rem] sm:h-20 sm:w-20" priority />

          <p
            className="mt-8 font-calligraphy text-5xl font-normal leading-none text-gold/55 sm:text-6xl"
            aria-hidden="true"
          >
            ٤٠٤
          </p>

          <h1 className="mt-5 font-display text-3xl font-semibold text-brown sm:text-[2rem]">
            الصفحة غير موجودة
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-mocha">
            يبدو أن الرابط الذي طلبتِه غير متاح أو تم نقله. يمكنكِ العودة للرئيسية ومتابعة التسوق من
            أثر.
          </p>

          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link to="/">العودة للرئيسية</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <Link to="/products">تسوقي المنتجات</Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
