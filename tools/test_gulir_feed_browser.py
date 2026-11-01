#!/usr/bin/env python3
"""Gulir feed regression. Run against a local HTTP server or QURAN_TEST_BASE."""
import json
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get('QURAN_TEST_BASE', 'http://127.0.0.1:8080').rstrip('/')

def keys(page):
    return page.locator('#feed .verse').evaluate_all('(cards)=>cards.map(card=>card.dataset.key)')

def ready(page):
    page.wait_for_function("document.querySelector('#feed .verse') && !document.querySelector('#feed-refresh').disabled", timeout=45000)

def swipe(page, cdp, y0, y1, x=195):
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y0}]})
    for step in range(1, 9):
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': y0 + (y1-y0)*step/8}]})
        page.wait_for_timeout(20)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    errors = []
    context = browser.new_context(viewport={'width':390,'height':844}, has_touch=True, is_mobile=True, reduced_motion='reduce', service_workers='block')
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE+'/gulir.html?s=107&a=4', wait_until='domcontentloaded')
    ready(page)
    assert keys(page)[:4] == ['107:4','107:5','107:6','107:7']
    first = page.locator('#feed .verse').first
    first.locator('[data-action=save]').click()
    first.locator('[data-action=share]').click()
    page.wait_for_function("document.querySelector('#story-image').naturalWidth===1080")
    page.locator('[data-story-theme=dusk]').click()
    page.locator('#story-latin').check()
    page.locator('#story-save-draft').click()
    page.locator('[data-close=share-dialog]').click()
    saved = page.evaluate("JSON.parse(localStorage.getItem('quran-oyen.gulir.v1')).saved")
    drafts = page.evaluate("localStorage.getItem('quran-oyen.story-drafts.v1')")
    first.get_by_role('button', name='Ayat berikutnya', exact=True).click()
    page.wait_for_function("document.querySelector('#location').textContent.includes('107:5')")
    page.locator('#feed .verse[data-key="107:5"]').get_by_role('button', name='Ayat sebelumnya', exact=True).click()
    page.wait_for_function("document.querySelector('#location').textContent.includes('107:4')")
    # A real wheel event must move the outer stream, even though text has its own scroller.
    page.mouse.move(10, 400)
    page.mouse.wheel(0, 650)
    page.wait_for_function("document.querySelector('#location').textContent.includes('107:5')")
    page.locator('#feed .verse[data-key="107:5"]').get_by_role('button', name='Ayat sebelumnya', exact=True).click()
    page.wait_for_function("document.querySelector('#location').textContent.includes('107:4')")
    # Reaching the tail appends, without duplicates or moving the current card back to the top.
    before = keys(page)
    tail_key = before[-3]
    page.locator(f'#feed .verse[data-key="{tail_key}"]').scroll_into_view_if_needed()
    page.wait_for_function('(n)=>document.querySelectorAll("#feed .verse").length>n', arg=len(before), timeout=45000)
    ready(page)
    assert len(keys(page)) == len(set(keys(page)))
    page.wait_for_function('(key)=>document.querySelector("#location").textContent.includes(key)', arg=tail_key)
    # Manual refresh changes the selection, not the saved verses, settings, or Story drafts.
    old = set(keys(page))
    page.get_by_role('button', name='Ganti ayat', exact=True).click()
    ready(page)
    assert old.isdisjoint(keys(page))
    assert 's=' not in page.url and 'a=' not in page.url
    assert page.locator('#feed').evaluate('(root)=>root.scrollTop') == 0
    assert page.evaluate("JSON.parse(localStorage.getItem('quran-oyen.gulir.v1')).saved") == saved
    assert page.evaluate("localStorage.getItem('quran-oyen.story-drafts.v1')") == drafts
    # A short pull is ignored; a deliberate downward pull refreshes without a page reload.
    cdp = context.new_cdp_session(page)
    old = keys(page)
    time_origin = page.evaluate('performance.timeOrigin')
    swipe(page, cdp, 210, 245)
    page.wait_for_timeout(150)
    assert keys(page) == old
    swipe(page, cdp, 210, 365)
    page.wait_for_function('(old)=>document.querySelector("#feed .verse").dataset.key!==old', arg=old[0], timeout=45000)
    ready(page)
    assert page.evaluate('performance.timeOrigin') == time_origin
    assert not page.locator('#feed-status').is_visible()
    for _ in range(2):
        old = keys(page)
        page.get_by_role('button', name='Ganti ayat', exact=True).click()
        ready(page)
        assert set(old).isdisjoint(keys(page))
    old = keys(page)
    page.reload(wait_until='domcontentloaded')
    ready(page)
    assert keys(page) != old
    # A long verse keeps an inner text scroller; the explicit next button still advances.
    page.goto(BASE+'/gulir.html?s=2&a=282', wait_until='domcontentloaded')
    ready(page)
    long = page.locator('#feed .verse[data-key="2:282"]')
    assert long.locator('.verse-text').evaluate('(text)=>text.scrollHeight>text.clientHeight')
    long.locator('.verse-text').evaluate('(text)=>text.scrollTop=100')
    old = keys(page)
    swipe(page, cdp, 250, 390)
    page.wait_for_timeout(150)
    assert keys(page) == old, 'Scrolling long text must not refresh the feed'
    long.get_by_role('button', name='Ayat berikutnya', exact=True).click()
    page.wait_for_function("!document.querySelector('#location').textContent.includes('2:282')")
    # Controller-level failure and double-input tests use a separate local fixture, not production state.
    fixture = context.new_page()
    fixture.route('**/__feed_fixture', lambda route: route.fulfill(content_type='text/html', body='<button id="refresh">Ganti</button><div id="status" hidden></div><section id="root"></section>'))
    fixture.goto(BASE+'/__feed_fixture')
    result = fixture.evaluate('''async () => {
      const {createGulirFeed}=await import('./gulir-feed.js');
      const root=document.querySelector('#root'),button=document.querySelector('#refresh'),status=document.querySelector('#status');
      const messages=[];let calls=0,mode='ok',release;
      const api={async batch(){calls++;if(mode==='fail')throw Error('network');if(mode==='wait')return new Promise(resolve=>release=resolve);return {items:[{unitKey:'1:1'}],units:['1:1'],failures:0};}};
      const feed=createGulirFeed({root,button,status,getData:()=>api,append:()=>{},replace:()=>{root.innerHTML='<article class="verse" data-key="1:1">Bacaan lama</article>';},retry:()=>{},notice:text=>messages.push(text)});
      await feed.refresh({initial:true});mode='fail';await feed.refresh();
      const preserved=root.textContent==='Bacaan lama'&&!button.disabled&&!feed.busy&&messages.length===1;
      mode='wait';const request=feed.refresh();const ignored=await feed.refresh();release({items:[{unitKey:'1:2'}],units:['1:2'],failures:0});await request;
      return {preserved,ignored,calls,busy:feed.busy};
    }'''.replace("import('./gulir-feed.js')", "import('/gulir-feed.js')"))
    assert result == {'preserved':True,'ignored':False,'calls':3,'busy':False}, result
    context.close()
    print('feed online: wheel/next/previous/infinite append/no duplicates/button refresh/pull refresh/short pull/long text/Story persistence/failure/double input: ok')

    # Keep only two complete cached surahs, then reload the default feed offline.
    offline = browser.new_context(viewport={'width':390,'height':844}, reduced_motion='reduce')
    page = offline.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE+'/gulir.html?s=107&a=4', wait_until='domcontentloaded')
    ready(page)
    page.wait_for_function('!!navigator.serviceWorker.controller', timeout=45000)
    page.reload(wait_until='domcontentloaded')
    ready(page)
    page.evaluate('''async () => {
      for(const n of ['107','112'])for(const path of [`s${n}.json`,`id/t${n}.json`,`links/l${n}.json`]){const response=await fetch('/data/'+path);if(!response.ok)throw Error('cache warm failed');await response.text();}
    }''')
    page.wait_for_function('''async () => {const {cachedSurahNumbers}=await import('/gulir-data.js');const numbers=await cachedSurahNumbers();return numbers.includes(107)&&numbers.includes(112);}''')
    page.evaluate(r'''async () => {
      for(const name of await caches.keys())if(name.startsWith('quran-')){const cache=await caches.open(name);for(const request of await cache.keys()){const path=new URL(request.url).pathname;const match=path.match(/\/data\/(?:s|id\/t|links\/l)(\d{3})\.json$/);if(match&&!['107','112'].includes(match[1]))await cache.delete(request);}}
    }''')
    offline.set_offline(True)
    page.goto(BASE+'/gulir.html', wait_until='domcontentloaded')
    ready(page)
    offline_keys = keys(page)
    assert offline_keys and all(key.split(':')[0] in ['107','112'] for key in offline_keys), offline_keys
    assert len(offline_keys) == len(set(offline_keys))
    old = keys(page)
    page.reload(wait_until='domcontentloaded')
    ready(page)
    assert keys(page) and all(key.split(':')[0] in ['107','112'] for key in keys(page))
    offline.set_offline(False)
    offline.close()
    browser.close()
    assert not errors, errors
    print('feed offline: fresh reload discovers downloaded surahs, no uncached daily-ref dependency: ok')
