#!/usr/bin/env python3
"""Local browser regression; run against python3 -m http.server 8080."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('QURAN_TEST_BASE','http://127.0.0.1:8080').rstrip('/')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,permissions=['clipboard-read','clipboard-write'],reduced_motion='reduce')
    context.add_init_script("Object.defineProperty(navigator,'share',{value:undefined,configurable:true})")
    page=context.new_page(); errors=[]; requests=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:requests.append(r.url))
    def mock_tafsir(route):
        n=int(route.request.url.rsplit('/',1)[-1]); count=7 if n==107 else 286
        route.fulfill(json={'code':200,'data':{'nomor':n,'tafsir':[{'ayat':a,'teks':f'Teks sumber uji ayat {a}. <script>tidak dijalankan</script>'} for a in range(1,count+1)]}})
    page.route('https://equran.id/api/v2/tafsir/*',mock_tafsir)
    page.goto(BASE+'/gulir.html?s=107&a=4',wait_until='domcontentloaded')
    page.locator('#feed .verse').first.wait_for()
    assert page.locator('#feed .verse').evaluate_all('(els)=>els.slice(0,4).map(e=>e.dataset.key)')==['107:4','107:5','107:6','107:7']
    page.wait_for_timeout(1900)
    first=page.locator('#feed .verse').first
    assert first.locator('.latin').inner_text().strip()
    assert first.locator('[data-action=latin]').get_attribute('aria-pressed')=='true'
    assert first.locator('.verse-context').inner_text().startswith('Rangkaian 1 dari 4')
    first.locator('[data-action=save]').click()
    assert first.locator('[data-action=save]').get_attribute('aria-pressed')=='true'
    first.locator('[data-action=share]').click()
    page.locator('#story-image').wait_for()
    page.wait_for_function("document.querySelector('#story-image').naturalWidth===1080")
    assert page.locator('#story-image').evaluate('(img)=>img.naturalHeight')==1920
    page.locator('[data-story-theme=paper]').click()
    page.wait_for_function("document.querySelector('#story-image').naturalWidth===1080")
    page.locator('#story-latin').check()
    page.locator('#story-save-draft').click()
    assert page.locator('#story-save-draft').inner_text()=='Perbarui rancangan tersimpan'
    page.locator('#share-text').click()
    clip=page.evaluate('navigator.clipboard.readText()')
    assert 's=107&a=4' in clip and 'Tanzil' in clip and 'Kemenag' in clip
    page.locator('[data-close=share-dialog]').click()
    first.locator('.study-button').click()
    page.locator('#study-content .word').first.wait_for()
    page.locator('#study-content .word').first.click()
    assert page.locator('.word-detail').is_visible()
    page.locator('[data-study=related]').click()
    page.wait_for_function("document.querySelector('#study-content').textContent.includes('hubungan linguistik')")
    page.locator('[data-study=tafsir]').click()
    page.locator('.tafsir-body').wait_for()
    page.get_by_role('button',name='Kemenag',exact=True).click()
    page.wait_for_function("document.querySelector('#study-content').textContent.includes('Teks sumber uji')")
    page.get_by_role('button',name='Jalalayn',exact=True).click()
    page.wait_for_function("document.querySelector('.tafsir-body').textContent.includes('al-Mahalli')")
    page.get_by_role('button',name='Al-Muntakhab',exact=True).click()
    page.wait_for_function("document.querySelector('.tafsir-body').textContent.includes('Quraish Shihab')")
    assert page.locator('#study-content script').count()==0
    page.locator('[data-close=learn-dialog]').click()
    page.locator('[data-view=today]').click()
    page.locator('#daily-goal').select_option('5')
    assert int(page.locator('.stat strong').first.inner_text().replace('.',''))>=1
    page.locator('[data-view=library]').click()
    page.locator('#saved-list .mini-card').first.wait_for()
    assert page.locator('#saved-list').inner_text().find('Al-Ma')>=0
    assert page.locator('#saved-list .latin').first.is_visible()
    page.locator('[data-view=feed]').click()
    page.locator('#feed .verse').first.locator('[data-action=latin]').click()
    assert page.locator('html').get_attribute('data-latin')=='hide'
    page.reload(wait_until='domcontentloaded')
    page.locator('#feed .verse').first.wait_for()
    assert page.locator('#feed .verse').first.locator('[data-action=latin]').get_attribute('aria-pressed')=='false'
    assert not page.locator('#feed .verse').first.locator('.latin').is_visible()
    page.locator('#feed .verse').first.locator('[data-action=latin]').click()
    assert page.locator('html').get_attribute('data-latin')=='show'
    page.reload(wait_until='domcontentloaded')
    page.locator('#feed .verse').first.wait_for()
    assert page.locator('#feed .verse').first.locator('[data-action=save]').get_attribute('aria-pressed')=='true'
    page.locator('[data-view=library]').click()
    draft=page.locator('#story-drafts .mini-card').first
    draft.wait_for()
    assert 'Al-Ma' in draft.inner_text() and 'Kertas' in draft.inner_text() and 'dengan transliterasi' in draft.inner_text()
    draft.get_by_role('button',name='Buka Story').click()
    page.wait_for_function("document.querySelector('#story-image').naturalWidth===1080")
    assert page.locator('[data-story-theme=paper]').get_attribute('aria-pressed')=='true'
    assert page.locator('#story-latin').is_checked()
    page.locator('[data-close=share-dialog]').click()
    page.locator('[data-view=feed]').click()
    page.locator('[data-view=foryou]').click()
    page.locator('#foryou .verse').first.wait_for(timeout=30000)
    page.locator('[data-view=feed]').click()
    page.locator('#settings-open').click()
    page.locator('.source-details summary').click()
    assert page.locator('#source-notes').inner_text().find('EQuran.id')>=0
    assert page.locator('#show-latin').is_checked()
    page.locator('#show-latin').uncheck()
    assert page.locator('html').get_attribute('data-latin')=='hide'
    page.locator('#show-latin').check()
    assert page.locator('html').get_attribute('data-latin')=='show'
    page.locator('#theme').select_option('dark')
    assert page.locator('html').get_attribute('data-theme')=='dark'
    page.locator('#theme').select_option('light')
    page.locator('[data-close=settings-dialog]').click()
    page.screenshot(path='/tmp/gulir-mobile.png')
    page.goto(BASE+'/gulir.html?s=2&a=282',wait_until='domcontentloaded')
    long=page.locator('#feed .verse[data-key="2:282"]');long.wait_for()
    long.scroll_into_view_if_needed()
    assert long.locator('.verse-text').evaluate('(e)=>e.scrollHeight>e.clientHeight')
    assert long.locator('.translation').inner_text().endswith('.')
    assert long.locator('.actions').is_visible()
    page.screenshot(path='/tmp/gulir-long-verse.png')
    long.locator('[data-action=share]').click()
    page.wait_for_function("!document.querySelector('#story-pager').hidden")
    assert page.locator('#story-page-label').inner_text()=='Gambar 1 dari 2'
    page.locator('#story-next').click()
    assert page.locator('#story-page-label').inner_text()=='Gambar 2 dari 2'
    page.locator('[data-close=share-dialog]').click()
    page.goto(BASE+'/gulir.html?s=107&a=4',wait_until='domcontentloaded')
    page.locator('#feed .verse').first.wait_for()
    page.wait_for_function('!!navigator.serviceWorker.controller',timeout=45000)
    page.reload();page.locator('#feed .verse').first.wait_for()
    page.locator('#feed .study-button').first.click()
    page.locator('[data-study=tafsir]').click()
    for name,credit in [('Jalalayn','al-Mahalli'),('Al-Muntakhab','Quraish Shihab')]:
        page.get_by_role('button',name=name,exact=True).click()
        page.wait_for_function('(credit)=>document.querySelector(".tafsir-body").textContent.includes(credit)',arg=credit)
    page.locator('[data-close=learn-dialog]').click()
    context.set_offline(True);page.reload();page.locator('#feed .verse').first.wait_for()
    page.locator('#feed .study-button').first.click();page.locator('[data-study=tafsir]').click()
    for name,credit in [('Jalalayn','al-Mahalli'),('Al-Muntakhab','Quraish Shihab')]:
        page.get_by_role('button',name=name,exact=True).click()
        page.wait_for_function('(credit)=>document.querySelector(".tafsir-body").textContent.includes(credit)',arg=credit)
    context.set_offline(False)
    page.goto(BASE+'/',wait_until='domcontentloaded')
    page.locator('#feature-gulir').wait_for();page.wait_for_timeout(1200)
    page.locator('#feature-gulir').click();page.locator('#feed .verse').first.wait_for()
    assert not any('/api/feed' in u or '/api/events' in u or 'quran-scroll.oyenza.com' in u for u in requests)
    assert not errors, errors
    context.close();browser.close()
print('gulir browser tests: ok · mobile/context/save/share/learn/progress/persistence/recommendations/theme/long verse/offline tafsir/main reader link/no feed tracking')
