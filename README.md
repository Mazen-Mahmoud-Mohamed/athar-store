<div align="center">

<img src="public/athar-logo.png" alt="Athar — أثر" width="150" />

# أثر | Athar Store

**أناقة تترك أثرًا**

متجر إلكتروني مصري للحقائب والإكسسوارات، بواجهة عربية كاملة (RTL)، وحسابات عملاء، وطلبات، ودفع إلكتروني، ولوحة تحكم، وتقييمات موثّقة.

*An Arabic-first, full-stack e-commerce experience for the Egyptian bags & accessories brand Athar.*

[**زيارة المتجر**](https://athar.qd.je) · [**استكشاف المنتجات**](https://athar.qd.je/products) · [**لوحة الإدارة**](https://athar.qd.je/admin/login)

[![Deploy GitHub Pages](https://github.com/Mazen-Mahmoud-Mohamed/athar-store/actions/workflows/deploy-github-pages.yml/badge.svg)](https://github.com/Mazen-Mahmoud-Mohamed/athar-store/actions/workflows/deploy-github-pages.yml)
![React](https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e?logo=supabase&logoColor=white)
![RTL](https://img.shields.io/badge/Language-Arabic%20%7C%20RTL-b8956c)

</div>

---

> **الحالة:** هذا مستودع التطبيق الفعلي، وليس قالب UI أو نسخة تجريبية من المرحلة الأولى. يعمل المتجر على [athar.qd.je](https://athar.qd.je) وتُنشر واجهته عبر GitHub Pages، بينما تعمل المصادقة وقاعدة البيانات والتخزين ووظائف الدفع عبر Supabase. تحديث التوثيق: **22 أكتوبر 2026**.

## المحتويات

- [نظرة عامة](#overview)
- [أحدث التطويرات](#whats-new)
- [التقنيات](#stack)
- [تشغيل المشروع محليًا](#getting-started)
- [الصفحات والمسارات](#routes)
- [بنية المشروع](#structure)
- [الطلبات والدفع](#orders-and-payments)
- [التقييمات وإدارة المحتوى](#reviews)
- [Supabase والأمان](#backend-and-security)
- [الاختبارات والتشغيل](#development-and-qa)
- [النشر](#deployment)
- [ملاحظات مهمة للمساهمين](#notes)

<a id="overview"></a>
## ✨ نظرة عامة

**أثر** تجربة تسوّق مصرية بتصميم هادئ بألوان الكريمي والبني والذهبي، مصمّمة للعربية من اليمين لليسار مع دعم الموبايل والكمبيوتر.

| المجال | المزايا الموجودة في الكود |
| --- | --- |
| **الواجهة والمتجر** | الصفحة الرئيسية، تصنيفات ومنتجات مباشرة من قاعدة البيانات، بحث، عروض، منتجات جديدة ومميزة، صفحات تفاصيل وصور منتجات |
| **كتالوج المنتجات** | تصفية حسب التصنيف والسعر والخصومات، ترتيب حسب الأحدث أو السعر أو الاسم، شريط فلاتر مدمج ولوحة سعر صغيرة متجاوبة |
| **السلة والشراء** | سلة محفوظة محليًا، تعديل الكميات، زر «شراء الآن» بدون تغيير السلة، مراجعة الأسعار والمخزون قبل تأكيد الطلب |
| **حسابات العملاء** | إنشاء حساب بالبريد وكلمة المرور، Google OAuth، تأكيد البريد، استعادة كلمة المرور، الملف الشخصي والعنوان الافتراضي |
| **الطلبات** | إنشاء طلبات للمستخدمين المسجلين، قائمة الطلبات وتفاصيلها، خطوات متابعة الحالة، طلب الإلغاء وفق قيود الخادم |
| **المدفوعات** | الدفع عند الاستلام (COD)، XPay Hosted Checkout (Test/Live)، التحقق من حالة الدفع من الخادم وWebhooks |
| **لوحة الإدارة** | إدارة المنتجات والتصنيفات والصور والمخزون، متابعة الطلبات وتغيير حالاتها، ومراجعة تقييمات العملاء |
| **التقييمات** | تقييم من 1 إلى 5 نجوم بعد تسليم طلب موثّق، تعليق وصورة اختياريان، موافقة الأدمن قبل النشر، إظهار الاسم باختيار العميل فقط |
| **الظهور وتجربة الاستخدام** | صفحات عربية RTL، صور محسّنة، بيانات SEO وOpen Graph وJSON-LD وsitemap وrobots.txt وصفحات سياسة الخصوصية والشروط والاسترجاع |

<a id="whats-new"></a>
## 🚀 أحدث التطويرات — أكتوبر 2026

1. **Customer Accounts & Google Sign-in:** إضافة نظام الحسابات وربط الطلبات بمالكها بدل إنشاء طلبات زائر جديدة، وتوفير لوحة «حسابي» وتتبّع الطلبات وتسجيل الدخول بجوجل.
2. **XPay Integration & Reliability:** Checkout إلكتروني من خلال Supabase Edge Functions، مع ربط إنشاء الطلب بجلسته الصحيحة، مفاتيح idempotency، والتحقق من حالة الدفع، واستقبال Webhooks مع طابور معالجة وإعادة المحاولة.
3. **Order / Inventory Guards:** حماية مخزون الطلبات وانتقالات حالاتها على مستوى PostgreSQL، مع ضوابط إلغاء الطلب والتعامل مع المدفوعات وعمليات الاسترداد.
4. **Verified Purchase Reviews:** تقييم المنتج فقط بعد أن تصل حالة الطلب إلى `delivered`؛ يمكن إضافة تعليق وصورة. كل التقييمات تمر بمراجعة الإدارة قبل ظهورها للعامة.
5. **Optional Reviewer Name:** اختيار **«إظهار اسمي مع التقييم»** غير مفعّل افتراضيًا. عند الموافقة، يظهر اسم العميل المسجّل في ملفه الشخصي فقط إذا وافق على مشاركته؛ التقييمات القديمة تظل مجهولة الاسم.
6. **Products UI/UX Refresh:** مساحات أصغر في صفحة `/products`، تصنيفات أفقية، أدوات تصفية وترتيب مختصرة، ولوحة مدمجة لتصفية السعر بدل النافذة الضخمة.
7. **Production Operations:** إعداد نشر GitHub Pages، مستندات تشغيل/استعادة ونسخ احتياطي مشفّر، واختبارات للأمان ومسارات الطلبات والدفع.

> بعض مستندات `docs/` و`supabase/SETUP.md` تصف حالة المشروع وقت كتابتها؛ راجع **ملفات الكود ومجلد migrations** باعتبارها المرجع الأحدث عند الاختلاف.

<a id="stack"></a>
## 🧰 التقنيات

| الطبقة | التقنية |
| --- | --- |
| Frontend | **React 19**, **TypeScript 6**, **Vite 8** |
| Styling & UI | **Tailwind CSS v4**, Radix UI, CVA, Lucide React, Sonner |
| Routing | **React Router 7** مع مسارات عامة ومحمية |
| Backend | **Supabase**: PostgreSQL, Auth, Row Level Security (RLS), Storage, Edge Functions |
| Authentication | البريد وكلمة المرور + **Google OAuth** من خلال Supabase Auth |
| Payments | **XPay Hosted Checkout** (منطق التحقق والمفاتيح السرية على الخادم) |
| Hosting | **GitHub Pages** على الدومين `athar.qd.je` |
| CI/CD | **GitHub Actions** للبناء والفحص والنشر |
| SEO | Open Graph، Structured Data (JSON-LD)، sitemap.xml، robots.txt |

<a id="getting-started"></a>
## 💻 تشغيل المشروع محليًا

**المتطلبات:** Node.js **22**، وnpm. تحتاج مشروع Supabase مُعدًّا ومفاتيح العميل العامة لاختبار الوظائف التي تعتمد على البيانات.

~~~bash
git clone https://github.com/Mazen-Mahmoud-Mohamed/athar-store.git
cd athar-store
npm ci
~~~

انسخ `.env.example` إلى `.env.local`:

~~~bash
cp .env.example .env.local
~~~

> على Windows PowerShell: `Copy-Item .env.example .env.local`

املأ القيم العامة التالية من إعدادات **مشروع Supabase الخاص ببيئة التطوير**:

~~~dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
~~~

ثم شغّل التطبيق:

~~~bash
npm run dev
~~~

Vite يعرض رابط التطوير محليًا (غالبًا `http://localhost:5173`).

**مهم جدًا:** لا تضع `service_role` أو `sb_secret_*` أو مفاتيح XPay أو أسرار Google داخل أي متغير يبدأ بـ`VITE_`؛ هذه المتغيرات تدخل في ملفات JavaScript العامة بعد البناء. ولا تستخدم قاعدة بيانات الإنتاج للتجارب أو `seed` إلا بتفويض واضح.

### أوامر التطوير

| الأمر | الاستخدام |
| --- | --- |
| `npm ci` | تثبيت الإصدارات المتوافقة مع `package-lock.json` |
| `npm run dev` | تشغيل خادم Vite المحلي |
| `npm run build` | فحص TypeScript ثم بناء نسخة الإنتاج |
| `npm run preview` | معاينة ملفات الإنتاج محليًا |
| `npm run lint` | تشغيل Oxlint |
| `npm run test:xpay` | اختبار أجزاء توقيع/تكامل XPay ببيانات اختبارية |
| `npm run test:orders` | اختبارات مسار الطلب والمخزون والدفع (قد تتطلب بيئة PostgreSQL اختبارية) |
| `npm run seo:sitemap` | توليد/تحديث sitemap اعتمادًا على الإعدادات المتاحة |

توجد اختبارات إضافية في `scripts/`، ومنها `test-customer-accounts-security.mjs` و`test-route-scroll.mjs` و`test-xpay-refunds.mjs`. بعض اختبارات الطلبات القديمة تعتمد على شكل قاعدة بيانات سابق؛ راجع متطلبات كل سكربت وبيئة الاختبار قبل تشغيله.

<a id="routes"></a>
## 🗺️ الصفحات والمسارات

### المتجر والحسابات

| المسار | الوظيفة |
| --- | --- |
| `/` | الرئيسية |
| `/products` | جميع المنتجات والبحث والتصفية والترتيب |
| `/products/:id` | تفاصيل المنتج، معرض الصور، التقييمات (يدعم slug أو UUID) |
| `/category/:slug` | منتجات تصنيف معين |
| `/cart` | سلة التسوق |
| `/checkout` | إتمام الطلب للمستخدم المسجل |
| `/checkout?intent=buy-now` | الشراء المباشر لمنتج |
| `/order-success` | نتيجة الطلب/متابعة حالة XPay |
| `/login` و`/register` | تسجيل الدخول وإنشاء الحساب |
| `/forgot-password` و`/reset-password` | استعادة كلمة المرور |
| `/auth/callback` | عودة تسجيل الدخول من مزود OAuth |
| `/account` | طلبات العميل |
| `/account/profile` | الملف الشخصي |
| `/account/orders/:id` | تفاصيل الطلب، المتابعة، الإلغاء، والتقييم بعد التسليم |
| `/privacy-policy` و`/terms` و`/return-policy` | السياسات والشروط والاسترجاع |

### لوحة الإدارة

| المسار | الوظيفة |
| --- | --- |
| `/admin/login` | تسجيل دخول المسؤول |
| `/admin` | إحصاءات ولوحة التحكم |
| `/admin/products` | إدارة المنتجات |
| `/admin/products/new` | إضافة منتج |
| `/admin/products/:id/edit` | تعديل منتج |
| `/admin/categories` | إدارة التصنيفات |
| `/admin/orders` | إدارة الطلبات |
| `/admin/orders/:id` | تفاصيل الطلب وتغيير الحالة |
| `/admin/reviews` | الموافقة على التقييمات أو إخفاؤها أو حذفها |

مسارات `/checkout` و`/account/*` محمية بجلسة عميل مؤكدة، ومسارات `/admin/*` محمية بتحقق صلاحية الإدارة.

<a id="structure"></a>
## 🗂️ بنية المستودع

~~~text
athar-store/
├── .github/workflows/
│   ├── deploy-github-pages.yml    # Build + publish
│   └── review-feature-check.yml   # PR build & lint
├── public/                         # Brand, favicon, SEO & CNAME
├── src/
│   ├── App.tsx                     # Routes & providers
│   ├── assets/                     # Brand assets
│   ├── components/                 # Shared layout, UI, SEO & admin
│   ├── config/                     # Site, public contact links
│   ├── features/
│   │   ├── account/                # Customer guards & review form
│   │   ├── admin/                  # Admin auth guard/provider
│   │   ├── cart/                   # Cart state & persistence
│   │   ├── catalog/                # Search/filter UI
│   │   ├── checkout/               # Buy-now session intent
│   │   └── products/               # Cards, gallery, approved reviews
│   ├── layouts/                    # Store & Admin layouts
│   ├── lib/                        # Validation, image & SEO helpers
│   ├── pages/                      # Store, account & admin routes
│   ├── services/                   # Supabase-facing data layer
│   ├── types/                      # Database & domain types
│   └── index.css                   # Tailwind & brand design tokens
├── supabase/
│   ├── migrations/                 # SQL 001–017 (versioned)
│   ├── functions/
│   │   ├── _shared/               # CORS, XPay, webhook processing
│   │   ├── xpay-create-payment/
│   │   ├── xpay-payment-status/
│   │   ├── xpay-webhook/
│   │   └── xpay-process-webhook-inbox/
│   ├── config.toml
│   ├── seed.sql
│   └── SETUP.md
├── scripts/                        # Tests, backup, restore, release, SEO
├── docs/                           # Operational & investigation notes
├── .env.example
├── package.json
└── vite.config.ts
~~~

<a id="orders-and-payments"></a>
## 🛒 الطلبات والدفع

### رحلة العميل

1. اختيار المنتج وإضافته للسلة أو استخدام **«شراء الآن»**.
2. تسجيل الدخول/إنشاء حساب إذا لزم، وإدخال عنوان ورقم هاتف مصري.
3. إعادة التحقق من توفر الكميات والأسعار؛ الأسعار النهائية تُحتسب **على الخادم**، وليس من مجموع السلة في المتصفح.
4. اختيار الدفع عند الاستلام (**COD**) أو **XPay Hosted Checkout**.
5. متابعة الطلب من `/account` حتى حالات: `pending → confirmed → preparing → shipped → delivered`. الإلغاء له مسار وقواعد مستقلة.
6. بعد `delivered` يمكن للعميل تقييم المنتجات التي كانت ضمن ذلك الطلب.

### XPay: كيف يعمل؟

~~~text
Customer checkout
     │
     ├── COD ────────► create_customer_order (PostgreSQL RPC)
     │
     └── XPay ───────► xpay-create-payment (Edge Function)
                              │
                              ▼
                        XPay Hosted Checkout
                              │
                    signed XPay webhook
                              │
                              ▼
                  xpay-webhook → durable inbox
                              │
                              ▼
                 xpay-process-webhook-inbox
                              │
                              ▼
                    verified payment/order state
~~~

- الأسرار و`XPAY_MODE` تُقرأ في **Edge Functions** فقط؛ الواجهة لا تستطيع فرض وضع Test/Live.
- إنشاء طلب XPay يتطلب هوية عميل صحيحة، ويتحقق من ملكية محاولة الدفع السابقة قبل إعادة استخدامها.
- توجد حماية ضد تكرار محاولات الدفع والأحداث، ومنطق للمخزون، وتأمين توقيع Webhook ومطابقة وضع الجلسة وقيمتها.
- نتيجة إعادة التوجيه من XPay **ليست دليل دفع**؛ الحالة المؤكدة تأتي من التحقق على الخادم.
- ملفات معالجة الاسترداد وحالات الدفع موجودة في `supabase/functions/_shared/` والمهاجرات ذات الصلة.

**إعدادات الخادم فقط (Supabase Edge Function Secrets):** `XPAY_MODE` و`XPAY_SECRET_KEY` و`XPAY_WEBHOOK_SECRET` و`STOREFRONT_URL`. قد يُستخدم `XPAY_WEBHOOK_SECRET_SECONDARY` مؤقتًا أثناء تغيير الوضع، وليس لتجاوز التحقق.

**Webhook endpoint:**

~~~text
https://rotcgsayspiphcisepmu.supabase.co/functions/v1/xpay-webhook
~~~

يوجد عامل لمعالجة الـinbox في `xpay-process-webhook-inbox` وإعداد جدولة في `scripts/schedule-webhook-inbox.sql`. لا تشغّل عمليات دفع أو Webhooks اصطناعية ضد الإنتاج للاختبار.

<a id="reviews"></a>
## ⭐ تقييمات المنتجات الموثّقة

- التقييم من **1 إلى 5 نجوم**، ويسمح به فقط لمنتج موجود داخل **طلب يخص صاحب الحساب وحالته `delivered`**.
- **تقييم واحد لكل بند في الطلب**؛ يتم التحقق من ذلك داخل قاعدة البيانات.
- نص حتى **1,200 حرف** وصورة واحدة اختيارية بصيغة **JPEG/PNG/WebP** حتى **5 MB**.
- يتم تخزين صور التقييم في حاوية **خاصة** `product-review-photos` مع قواعد Storage/RLS وروابط عرض مؤقتة.
- كل تقييم يبدأ بحالة **`pending`**؛ لا يدخل في متوسط النجوم ولا يظهر للعامة قبل **`approved`**.
- يستطيع الأدمن **اعتماد، إخفاء، أو حذف** التقييم من `/admin/reviews`.
- خيار **إظهار الاسم** اختياري ومغلق افتراضيًا. عند تفعيله يُحفظ الاسم الظاهر من ملف العميل لحظة الإرسال؛ غير ذلك يظهر باسم عام **«عميل من أثر»**. التقييمات القديمة لا تكشف هوية أصحابها.

**مرجع التنفيذ:** `src/features/account/OrderProductReviews.tsx`، `src/features/products/ProductReviews.tsx`، `src/services/reviewService.ts` والمهاجرات `016` و`017`.

<a id="backend-and-security"></a>
## 🔐 Supabase والحدود الأمنية

الخلفية ليست مجرد API عامة؛ **RLS وPostgreSQL RPCs** مسؤولة عن التحقق من أذونات الوصول وملكية البيانات وانتقالات الطلبات.

| المورد | الاستخدام |
| --- | --- |
| `profiles` | معلومات العميل ودوره: `customer` أو `admin` |
| `categories` و`products` | كتالوج المنتجات والتصنيفات والمخزون |
| `orders` و`order_items` | بيانات الطلب والمنتجات والأسعار المحفوظة عند الشراء |
| `payments` و`xpay_webhook_events` و`xpay_refunds` | محاولات الدفع وأحداث XPay وسجل الاسترداد |
| `xpay_webhook_inbox` | الاستقبال الدائم ومعالجة Webhook مع إعادة المحاولة |
| `release_controls` | إيقاف آمن للـcheckout ومعالجة المال أثناء الصيانة |
| `product_reviews` | التقييمات، الموافقات، وخيار عرض الاسم |
| `product-images` | صور الكتالوج العامة، ورفعها بصلاحيات أدمن |
| `product-review-photos` | صور التقييمات الخاصة حتى الاعتماد |

**مراحل migrations:**

- **001–007:** المخطط الأساسي والصلاحيات والتخزين والتصنيفات.
- **008–011:** XPay والسجلات والمنح المطلوبة للوظائف.
- **012–014:** حماية المخزون والمدفوعات، سجل الاستردادات، وضع الصيانة وWebhook inbox.
- **015:** حسابات العملاء، ملكية الطلبات، إلغاء العميل، واستبدال إنشاء الطلبات العامة.
- **016:** التقييمات الموثقة، الصور الخاصة، وسياسات مراجعة الأدمن.
- **017:** الإظهار الاختياري لاسم صاحب التقييم مع الحفاظ على توافق الدوال القديمة.

> ⚠️ **هام قبل أي migration على الإنتاج:** الملفات التاريخية لم تُعدّل بعد تطبيقها. بعض migrations الأحدث طُبّقت من خلال Supabase Management API وسُجلت في تاريخ الإنتاج بأرقام تشغيل تختلف عن أرقام الملفات المحلية. **افحص `supabase_migrations.schema_migrations` وقارن المخطط الفعلي قبل `supabase db push`** حتى لا تُعاد migration مطبقة. اختبر أولًا في قاعدة بيانات منفصلة واحتفظ بنسخة احتياطية قابلة للاستعادة.

**ملاحظات أمان:** Supabase Auth يوفر حدود المعدّل الخاصة بخدمات المصادقة وفق إعدادات المشروع، لكن لا يوجد في الواجهة/الوظائف الحالية نظام مخصص شامل لتحديد معدل طلبات إنشاء الأوردر وXPay أو CAPTCHA عام. لا تعتبر RLS بديلًا عن Rate Limiting. راجع إعدادات Auth والتتبع قبل التوسع.

<a id="development-and-qa"></a>
## 🧪 الاختبار والتشغيل الآمن

تشغّل GitHub Actions على Pull Requests:

~~~bash
npm ci
npm run build
npm run lint
~~~

قبل نشر تعديل يمس الدفع أو الطلبات أو RLS، يلزم فوق ذلك فحص السيناريوهات ذات الصلة، بما في ذلك:

- صلاحية المستخدم، ومحاولات الوصول لطلبات وتقييمات عملاء آخرين.
- تسلسل حالات الطلب والمخزون مع الإلغاء وإعادة المحاولة.
- مطابقة المبالغ ووضع XPay وWebhooks الموقعة وتكرار الحدث والاسترداد.
- موافقة المسؤول قبل نشر أي تقييم أو صورة أو اسم اختياري.
- التوافق بين ملف migration وحالة قاعدة البيانات التي ستستقبله.

**نسخ الإنتاج الاحتياطية/الاستعادة:** توجد أدوات خاصة في `scripts/backup-production.ps1` و`scripts/verify-production-backup.ps1` ومستندات `docs/`. تعتمد على أدوات PostgreSQL 17.11 وصلاحيات وبيئة Windows محمية، وليست أمرًا يُشغّل تلقائيًا على جهاز مطوّر. **نجاح تشفير الأرشيف لا يساوي نجاح استعادة إنتاجية مجرّبة**؛ راجع تقارير التحقق الفعلية قبل أي عملية صيانة.

<a id="deployment"></a>
## 🌍 النشر

الواجهة مستضافة على **GitHub Pages** بالدومين المخصص:

**[https://athar.qd.je](https://athar.qd.je)**

ملف النشر: `.github/workflows/deploy-github-pages.yml`

- كل push إلى `main` يشغّل `npm ci` و`npm run build`، ثم يتحقق من مسارات الملفات وملفات SEO ويرفع `dist/` إلى Pages.
- يستخدم GitHub Actions المتغيرين العامين `VITE_SUPABASE_URL` و`VITE_SUPABASE_ANON_KEY` في **Build** من GitHub Secrets.
- قاعدة `base: '/'` مناسبة للدومين المخصص؛ ينسخ Vite `index.html` إلى `404.html` لدعم فتح روابط React Router المباشرة.
- تتمتع Supabase Edge Functions وMigrations **بدورة نشر مستقلة**؛ نشر GitHub Pages وحده **لا يطبّق SQL** ولا ينشر تغييرات وظائف XPay.
- `public/CNAME` و`public/sitemap.xml` و`public/robots.txt` ضمن إعدادات الموقع؛ توليد sitemap المتصل بالمنتجات يحاول الاستفادة من البيئة المتاحة أثناء البناء.

**لإعداد OAuth:** فعّل Google Provider في Supabase Auth، وضع callback الخاص بـSupabase في Google Cloud OAuth client، واضبط Site URL وروابط إعادة التوجيه لتطابق الدومين. لا تحفظ Client Secret في Git أو `VITE_*`.

<a id="notes"></a>
## 📚 توثيق وملاحظات للمساهمين

- [إعداد Supabase](supabase/SETUP.md) — تفاصيل الإعداد وXPay (**قد تتضمن خطوات من إصدار سابق**).
- [مهاجرات قاعدة البيانات](supabase/migrations/) — المرجع التنفيذي للمخطط.
- [وثائق التشغيل والتحقيقات](docs/) — تفاصيل المخزون وXPay والنسخ الاحتياطية وتاريخ قرارات الإصلاح.
- [سكربتات الفحص والصيانة](scripts/) — اختبارات وإجراءات تشغيل يجب قراءة متطلباتها قبل التنفيذ.
- [CI/CD](.github/workflows/) — تعريفات البناء والفحص والنشر.

**إرشادات المساهمة:** أنشئ فرعًا لكل ميزة، ولا تضف كلمات مرور أو أسرارًا أو بيانات عملاء إلى المستودع. تأكد من البناء وLint، واختبر تغييرات الخادم وصلاحيات RLS في بيئة منفصلة، ثم أرسل Pull Request يتضمن خطوات الاختبار.

**الترخيص:** لا يحتوي المستودع حاليًا على ملف `LICENSE`؛ لا تفترض ترخيصًا مفتوح المصدر قبل الرجوع إلى مالك المشروع.

---

<div align="center">

**أثر — أناقة تترك أثرًا ✨**

[المتجر](https://athar.qd.je) · [إنستغرام](https://www.instagram.com/atha.r1797) · [التواصل بالبريد](mailto:Atharbags2026@gmail.com)

Built with care for Arabic-first shopping.

</div>
