// Read-only production browser checks. Never submits checkout or permits POSTs.
import assert from 'node:assert/strict'
import {chromium} from 'file:///C:/Users/mmahm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
const origin='https://athar.qd.je'
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true})
try {
  for(const [device,viewport] of [['desktop',{width:1280,height:900}],['mobile',{width:390,height:844}]]) {
    const context=await browser.newContext({viewport,isMobile:device==='mobile',hasTouch:device==='mobile',locale:'ar-EG'})
    const page=await context.newPage()
    let blockedMutations=0,pageErrors=0
    const blockedPaths=[]
    page.on('pageerror',()=>pageErrors++)
    await page.route('**/*',route=>{
      if(!['GET','HEAD','OPTIONS'].includes(route.request().method())){blockedMutations++;const url=new URL(route.request().url());blockedPaths.push(url.hostname+url.pathname);return route.abort()}
      return route.continue()
    })
    const productLink=()=>page.locator('a[href^="/products/"]').first()
    async function clickFromScrolledPage(link) {
      await link.waitFor({state:'attached',timeout:25000})
      await page.evaluate(()=>window.scrollTo({top:document.body.scrollHeight,behavior:'instant'}))
      await page.waitForTimeout(150)
      const fromY=await page.evaluate(()=>window.scrollY)
      await link.evaluate(element=>element.click())
      await page.waitForFunction(()=>/^\/products\/[^/]+$/.test(location.pathname),{timeout:25000})
      await page.locator('h1').first().waitFor({state:'visible',timeout:25000})
      await page.waitForFunction(()=>window.scrollY<=1,{timeout:10000})
      assert.equal(await page.evaluate(()=>window.scrollY),0,`${device} product opened below top`)
      return fromY
    }
    await page.goto(origin,{waitUntil:'domcontentloaded'})
    const homeY=await clickFromScrolledPage(productLink())
    assert.ok(homeY>0,`${device} homepage fixture did not scroll`)
    await page.goBack({waitUntil:'domcontentloaded'})
    await page.waitForFunction(()=>location.pathname==='/'&&window.scrollY>0,{timeout:15000})
    const backRestored=await page.evaluate(()=>window.scrollY>0)
    await page.goto(origin+'/products',{waitUntil:'domcontentloaded'})
    await clickFromScrolledPage(productLink())
    const related=page.locator('a[href^="/products/"]')
    await related.first().waitFor({state:'attached',timeout:20000})
    await clickFromScrolledPage(related.first())
    await page.goto(origin,{waitUntil:'domcontentloaded'})
    const category=page.locator('a[href^="/category/"]').first()
    await category.waitFor({state:'attached',timeout:20000})
    await category.evaluate(element=>element.click())
    await page.waitForFunction(()=>location.pathname.startsWith('/category/'),{timeout:15000})
    await clickFromScrolledPage(productLink())
    await page.getByRole('button',{name:/أضيفي إلى السلة/}).click()
    await page.goto(origin+'/cart',{waitUntil:'domcontentloaded'})
    const checkout=page.getByRole('link',{name:'إتمام الطلب',exact:true})
    await checkout.waitFor({state:'visible',timeout:20000})
    await checkout.click()
    await page.waitForFunction(()=>location.pathname==='/checkout',{timeout:20000})
    assert.ok(await page.locator('form').count(),`${device} checkout form missing`)
    assert.equal(pageErrors,0,`${device} browser runtime errors`)
    // The embedded Google Maps viewport lookup is a read RPC sent as POST.
    // Keep it blocked too; it is outside checkout/payment validation.
    assert.ok(blockedPaths.every(path=>path==='maps.googleapis.com/$rpc/google.internal.maps.mapsjs.v1.MapsJsInternalService/GetViewportInfo'),`${device} unexpected application mutation attempted`)
    console.log(JSON.stringify({device,homepageToProduct:'PASS',listingToProduct:'PASS',categoryToProduct:'PASS',relatedToProduct:'PASS',productScrollY:0,backRestored,cartCheckout:'PASS',paymentsCreated:0,allowedMutatingRequests:0,blockedMapLookups:blockedMutations}))
    await context.close()
  }
} finally {await browser.close()}
