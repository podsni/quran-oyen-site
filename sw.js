// The offline copy of the Quran site: a service worker, plain JS, no build step.
// deploy/stamp_sw.py fills the two placeholders below in every release:
//   FILES    each published path ("app.js", "data/s002.json", "index.html"; no leading slash) -> the first 10 hex of its
//            sha256. null = a local build: the worker does nothing (no cache, no fetch handler). false = the off switch
//            (deploy/sw-off.sh): the worker takes over at once, deletes every cache and unregisters itself.
//   VERSION  the release id and commit ("20261015T173720Z-ae7012c"), so every release is a new worker. It starts with
//            the release's UTC time, so the releases' caches sort by age.
// One cache per release, 'quran-<VERSION>', keyed by content: "/<path>?h=<hash>". A key names one file's bytes: a file
// that did not change between two releases has the same key in both, and a changed file gets a new key. A network copy
// is fetched at that same hashed address, so neither the browser's cache nor Cloudflare's can hand back an older copy,
// and its bytes must match the hash before it is kept. A copy that does not match (the site moved on since this worker)
// is passed to the page but never kept.
// install   the shell (index.html, every top-level script, vendor/, the small icons, the manifest and the first data
//           files): copied by its key from an older release's cache where it did not change, else fetched. Then every
//           other key it shares with an older cache (the surahs read or downloaded under the last release), while the
//           store has room. A failed install deletes the cache it made.
//           No skipWaiting: a new worker waits until the page asks ({type:'skip-waiting'}) or every tab is closed.
// activate  moves in what an older cache holds and this one does not (kept while this one waited, or not copied for
//           want of room), deletes the OLDER releases' caches (and 'quran-files', the one cache of the first offline
//           copy), then takes the open pages. A newer release's cache is never touched: its worker may be installing.
// fetch     same-origin GET only, /api/ untouched. A path in FILES is served from the cache, else fetched and kept.
//           Offline, a page load of the site's root gets the kept index.html, and of any other address the root.
//           Paths not in FILES go to the network.
// messages  (page -> navigator.serviceWorker.controller.postMessage(m); the answers go to the page that asked)
//   {type:'download-all'}  every data/ file not kept yet, 4 at a time:
//                          {type:'download-progress', done, total, bytes} after each file (done counts kept files),
//                          then {type:'download-done', total, bytes} or {type:'download-error', code, message, done, total}
//                          code: 'offline' (the network failed), 'changed' (a newer release is live: update first),
//                          'quota' (the phone's storage is full), 'http' (the server said no), 'off' (no offline copy
//                          in this build). bytes = bytes fetched by this run.
//   {type:'cache-status'}  {type:'cache-status', cachedData, totalData, bytes, version, on}: data files kept / in this
//                          release, the bytes kept, VERSION, and whether this build keeps an offline copy at all.
//   {type:'skip-waiting'}  a waiting worker takes over (the page then gets 'controllerchange').
'use strict';
const FILES = /*FILES*/{"app.js":"a5c754fd0e","data/id/t001.json":"d205e5f794","data/id/t002.json":"c90ec6a7e7","data/id/t003.json":"8aa2b24f63","data/id/t004.json":"dd119e4a8e","data/id/t005.json":"b0a2adea9f","data/id/t006.json":"2b1060d952","data/id/t007.json":"d8223c4a79","data/id/t008.json":"2a287c0747","data/id/t009.json":"e9bd1342c0","data/id/t010.json":"75ee3c0977","data/id/t011.json":"59bd0c65d5","data/id/t012.json":"4c0de26592","data/id/t013.json":"9eda62ee88","data/id/t014.json":"54a1ac2cd8","data/id/t015.json":"727fb66d46","data/id/t016.json":"c8ca30041c","data/id/t017.json":"618ba684f1","data/id/t018.json":"b181923f63","data/id/t019.json":"98af0ffa45","data/id/t020.json":"400ac499ec","data/id/t021.json":"5fc10ea004","data/id/t022.json":"d03021a4be","data/id/t023.json":"4b3cb040de","data/id/t024.json":"cc55fdab12","data/id/t025.json":"52f6cc3026","data/id/t026.json":"6e9ea8de7b","data/id/t027.json":"6fb244351f","data/id/t028.json":"0e2b4f525d","data/id/t029.json":"616775a7ea","data/id/t030.json":"f18aecd9c3","data/id/t031.json":"414fdc1dd8","data/id/t032.json":"f12653f0bd","data/id/t033.json":"f1be987086","data/id/t034.json":"110fe9e288","data/id/t035.json":"3a3c992bc1","data/id/t036.json":"f27611ecfe","data/id/t037.json":"4ad2d159ed","data/id/t038.json":"6d8bfc8178","data/id/t039.json":"74a94b21dd","data/id/t040.json":"b2c2579e2f","data/id/t041.json":"e79ab5bd59","data/id/t042.json":"ca31456e91","data/id/t043.json":"097d28c6c7","data/id/t044.json":"b128d6f658","data/id/t045.json":"daa290cbf7","data/id/t046.json":"5b89293f09","data/id/t047.json":"7b184679fd","data/id/t048.json":"08f734e625","data/id/t049.json":"7c4b8fc10a","data/id/t050.json":"cdadcc9b88","data/id/t051.json":"1fde82c089","data/id/t052.json":"bdb93bcddd","data/id/t053.json":"1372cf14f4","data/id/t054.json":"33f14b079f","data/id/t055.json":"3e1929a8a9","data/id/t056.json":"39b4fef417","data/id/t057.json":"7fa60d9547","data/id/t058.json":"d632b2967f","data/id/t059.json":"abfed5d61a","data/id/t060.json":"c2c1e863f8","data/id/t061.json":"27e12b2234","data/id/t062.json":"0d62fd2d96","data/id/t063.json":"227882ecea","data/id/t064.json":"daf6507e95","data/id/t065.json":"d152477249","data/id/t066.json":"f24ab456c1","data/id/t067.json":"5defe4c121","data/id/t068.json":"b4e09c7b4b","data/id/t069.json":"d45cb52f48","data/id/t070.json":"7c013fdbc2","data/id/t071.json":"eb3a26713c","data/id/t072.json":"0554c8364d","data/id/t073.json":"cdb4e0cefc","data/id/t074.json":"9f649cfac1","data/id/t075.json":"a9b4b36a96","data/id/t076.json":"c599058d53","data/id/t077.json":"680596417a","data/id/t078.json":"0d0edc84de","data/id/t079.json":"bcd4fe7678","data/id/t080.json":"15209353ea","data/id/t081.json":"0e93561687","data/id/t082.json":"7744f1b19b","data/id/t083.json":"b3d773d0b9","data/id/t084.json":"5e529ad81c","data/id/t085.json":"c2f38f95a3","data/id/t086.json":"e099164198","data/id/t087.json":"f9be3ed578","data/id/t088.json":"740b26dc5c","data/id/t089.json":"f2e14627d3","data/id/t090.json":"8a6fd0855a","data/id/t091.json":"cbdbecace1","data/id/t092.json":"49a95b044f","data/id/t093.json":"34ab6bf271","data/id/t094.json":"6a52acaafb","data/id/t095.json":"1314966c81","data/id/t096.json":"da7639d3d3","data/id/t097.json":"e697f05502","data/id/t098.json":"53ab03f512","data/id/t099.json":"b6156d5ef4","data/id/t100.json":"e65e0d368b","data/id/t101.json":"548543e992","data/id/t102.json":"e05870b068","data/id/t103.json":"76f2a5dff2","data/id/t104.json":"7b3fa9177b","data/id/t105.json":"7460de41aa","data/id/t106.json":"637fc62026","data/id/t107.json":"c1e744b661","data/id/t108.json":"3c9d0b2fa4","data/id/t109.json":"557f914b6e","data/id/t110.json":"921cf42614","data/id/t111.json":"0467e57c07","data/id/t112.json":"9b57e08630","data/id/t113.json":"1c31eff96d","data/id/t114.json":"63c4c3d835","data/index.json":"31ce924383","data/links/l001.json":"6f9f80d13b","data/links/l002.json":"ae9208a381","data/links/l003.json":"319f60cb44","data/links/l004.json":"114181446e","data/links/l005.json":"314b5d0271","data/links/l006.json":"fa60b366ab","data/links/l007.json":"678c1ce76c","data/links/l008.json":"5983e4b408","data/links/l009.json":"924ff54ffe","data/links/l010.json":"c95e01a212","data/links/l011.json":"640a0e6240","data/links/l012.json":"a4ed27f68f","data/links/l013.json":"bcc90c3c4c","data/links/l014.json":"eceb04baa6","data/links/l015.json":"8d348c420c","data/links/l016.json":"0451946bcb","data/links/l017.json":"656a018698","data/links/l018.json":"8c9f85268c","data/links/l019.json":"e39abdc8fc","data/links/l020.json":"a4eebf5585","data/links/l021.json":"f62edee674","data/links/l022.json":"b64881aacc","data/links/l023.json":"8f4dd795cf","data/links/l024.json":"c6cd0ca36d","data/links/l025.json":"073a952dd1","data/links/l026.json":"f96287bccb","data/links/l027.json":"3d47b3b143","data/links/l028.json":"989394954d","data/links/l029.json":"c756fe2da4","data/links/l030.json":"be460da07c","data/links/l031.json":"49afd97d57","data/links/l032.json":"990d04ca84","data/links/l033.json":"708c96001e","data/links/l034.json":"bc8c1be300","data/links/l035.json":"033cdc9dcc","data/links/l036.json":"40e6f25a70","data/links/l037.json":"d8e6d0278f","data/links/l038.json":"db67c5ca68","data/links/l039.json":"a40f199630","data/links/l040.json":"395019b28c","data/links/l041.json":"e0b6967416","data/links/l042.json":"460aa55c51","data/links/l043.json":"384ff9f8d0","data/links/l044.json":"e534a50c0c","data/links/l045.json":"57d6b27c78","data/links/l046.json":"2be127a292","data/links/l047.json":"761183c0cb","data/links/l048.json":"73b1a73605","data/links/l049.json":"1ff90c0cb8","data/links/l050.json":"40adba3f4e","data/links/l051.json":"91dd9845b0","data/links/l052.json":"dab46a525d","data/links/l053.json":"31452e5384","data/links/l054.json":"a959d9debb","data/links/l055.json":"442fa77cde","data/links/l056.json":"8a2a01859c","data/links/l057.json":"c0f9b376eb","data/links/l058.json":"9743a94d51","data/links/l059.json":"4478e4370a","data/links/l060.json":"b459384ab8","data/links/l061.json":"d4c0c13a94","data/links/l062.json":"7215720d6d","data/links/l063.json":"b344bf1730","data/links/l064.json":"fdf4e9427b","data/links/l065.json":"c18a77c215","data/links/l066.json":"a3986c2799","data/links/l067.json":"54d110a0e0","data/links/l068.json":"674c24b215","data/links/l069.json":"fa66d44a09","data/links/l070.json":"962de3144d","data/links/l071.json":"033cc3acec","data/links/l072.json":"cdc64fccdf","data/links/l073.json":"5e539b724b","data/links/l074.json":"a5df13dfe1","data/links/l075.json":"1cfe658cae","data/links/l076.json":"54fbf36034","data/links/l077.json":"6bd1ebf25b","data/links/l078.json":"a7885f2db3","data/links/l079.json":"d528ce5d90","data/links/l080.json":"b6a80269f7","data/links/l081.json":"76398974f7","data/links/l082.json":"299ae4a3c7","data/links/l083.json":"5edba25f59","data/links/l084.json":"97f29175b8","data/links/l085.json":"e768f42fd1","data/links/l086.json":"1d8a51c1db","data/links/l087.json":"0b3841e1b7","data/links/l088.json":"b65b58d5e5","data/links/l089.json":"7c89fd5423","data/links/l090.json":"281620f275","data/links/l091.json":"a72574e4c2","data/links/l092.json":"7869959ed3","data/links/l093.json":"cd1df7770c","data/links/l094.json":"c04ac64d20","data/links/l095.json":"0f3f48bd34","data/links/l096.json":"88cc32dcc0","data/links/l097.json":"59770e6980","data/links/l098.json":"9a8b4db9bb","data/links/l099.json":"d24e10f4a2","data/links/l100.json":"dc9f143499","data/links/l101.json":"28ed51ea09","data/links/l102.json":"04c31063a8","data/links/l103.json":"23d562ca36","data/links/l104.json":"50c4763ac0","data/links/l105.json":"62ca1654a4","data/links/l106.json":"c7885222e5","data/links/l107.json":"f17ea4174b","data/links/l108.json":"026c20392b","data/links/l109.json":"d2f3beb6a1","data/links/l110.json":"3417ec21fc","data/links/l111.json":"5f2bbf8b42","data/links/l112.json":"6ff67b1d2f","data/links/l113.json":"38f68ae587","data/links/l114.json":"dd8e024f82","data/links/links-meta.json":"690c8228a8","data/roots-table.bin":"c711f99db5","data/roots-table.json":"806fe54c7e","data/roots.json":"6ce80285cf","data/s001.json":"b27a2b2675","data/s002.json":"65ae55ae95","data/s003.json":"8efbf6a915","data/s004.json":"b8294f3122","data/s005.json":"f1962a4bae","data/s006.json":"4a519c1ec9","data/s007.json":"2ab1593209","data/s008.json":"fa7a2e563c","data/s009.json":"5a021d34e5","data/s010.json":"42588b74fb","data/s011.json":"37137ea59c","data/s012.json":"b1e815e7b3","data/s013.json":"9a29bb843f","data/s014.json":"dfeb1c0187","data/s015.json":"0a8c2e6e0a","data/s016.json":"b5f8e8e21a","data/s017.json":"fb93b303e5","data/s018.json":"885855fa80","data/s019.json":"bc133e0abd","data/s020.json":"b96b40e488","data/s021.json":"8e2ae65d6c","data/s022.json":"d54a0a736b","data/s023.json":"e9bb4d2c6b","data/s024.json":"ade3e45055","data/s025.json":"49a5e5c26e","data/s026.json":"4c292b15ab","data/s027.json":"b07e014af5","data/s028.json":"5845d0b292","data/s029.json":"b57050ef1b","data/s030.json":"2e590fd8d2","data/s031.json":"7bf68967d1","data/s032.json":"2a8e323f92","data/s033.json":"13d33c333e","data/s034.json":"a62c597460","data/s035.json":"8f46b28e6e","data/s036.json":"7817e295e1","data/s037.json":"94d413808f","data/s038.json":"8c0aded1cb","data/s039.json":"d951a6e6b5","data/s040.json":"ed2c0b5eee","data/s041.json":"4e74e51a50","data/s042.json":"674e34a4da","data/s043.json":"f35c169553","data/s044.json":"ebeef782d5","data/s045.json":"07b795ffcf","data/s046.json":"08caab8124","data/s047.json":"da1efdd5ce","data/s048.json":"ae2780b183","data/s049.json":"0994c742c2","data/s050.json":"e1b4b05a6b","data/s051.json":"007c3520c2","data/s052.json":"2e24106f2c","data/s053.json":"ee0dbf8537","data/s054.json":"e16afe59d5","data/s055.json":"c1551999c1","data/s056.json":"1549934dd1","data/s057.json":"9b5c648bf8","data/s058.json":"fdde66d7f0","data/s059.json":"6c4bc4a722","data/s060.json":"02b07de9e2","data/s061.json":"c037c45f04","data/s062.json":"37436f3802","data/s063.json":"49f9654117","data/s064.json":"02bddcb53c","data/s065.json":"22e8db7424","data/s066.json":"f02767f6e7","data/s067.json":"d5595d37ec","data/s068.json":"e351ea319b","data/s069.json":"8cde1dcf06","data/s070.json":"506bf65ff8","data/s071.json":"d156c41ee8","data/s072.json":"3c8d1c80d8","data/s073.json":"282ba659e1","data/s074.json":"e2c5bb70e2","data/s075.json":"9a8dba8327","data/s076.json":"17e6cff0cf","data/s077.json":"cce692d920","data/s078.json":"2bab30e992","data/s079.json":"4d9d13e21a","data/s080.json":"797e89b50e","data/s081.json":"699829efaf","data/s082.json":"d5baa563dd","data/s083.json":"98ded47cc1","data/s084.json":"614384be14","data/s085.json":"bdf05fe6cb","data/s086.json":"b778da0f4c","data/s087.json":"7d9923b66d","data/s088.json":"bf2b9277da","data/s089.json":"658bb1b727","data/s090.json":"d0b0ff7881","data/s091.json":"5570b05703","data/s092.json":"9e84824dea","data/s093.json":"e70626458f","data/s094.json":"d397edbe62","data/s095.json":"ed28a09c1c","data/s096.json":"d2236013b1","data/s097.json":"28550ca3dc","data/s098.json":"a41f02f7b1","data/s099.json":"ade58511f4","data/s100.json":"a9b982f575","data/s101.json":"38a864852b","data/s102.json":"6aa737f960","data/s103.json":"154344d124","data/s104.json":"9469419186","data/s105.json":"59eb10bb29","data/s106.json":"37509110c4","data/s107.json":"22820b90f7","data/s108.json":"95a14a8e81","data/s109.json":"141fbd79d2","data/s110.json":"3acbe23fb8","data/s111.json":"f9f89e309f","data/s112.json":"283fc392cd","data/s113.json":"bef61b2533","data/s114.json":"63b8b5290b","data/same-count-places.bin":"4facd14d33","data/same-count.json":"ea3e1a9206","data/search-id.json":"1aa53e1fc9","data/search.json":"bcb46620f3","data/words.bin":"e94d3227eb","data/words.json":"a7e29b8554","dots.js":"f18af6a5d6","equran.js":"635ea1a2fa","gulir-data.js":"a8ad1174ed","gulir-state.js":"f2979de67d","gulir-tafsir.js":"1ebe7ee4c7","gulir.css":"2faa2b8223","gulir.html":"36efc57ab0","gulir.js":"06d6d1f227","hadith-tafsir.js":"16ed806e50","ibadah.js":"4016bd7996","icons/apple-touch-icon.png":"1ff2da9697","icons/favicon-32.png":"2db7e58340","icons/favicon.svg":"92a7be6119","icons/icon-192.png":"6d7ec5f6f7","icons/icon-512.png":"e5eceda1ad","icons/icon-maskable-512.png":"de5ba13e62","icons/splash-1080x2340.png":"888caee64b","icons/splash-1125x2436.png":"3fb3b14a83","icons/splash-1170x2532.png":"b3f4e18d93","icons/splash-1179x2556.png":"c8f2c57c2c","icons/splash-1206x2622.png":"a337dcf243","icons/splash-1242x2688.png":"cf1acac8da","icons/splash-1284x2778.png":"a41ef8422a","icons/splash-1290x2796.png":"892ada333b","icons/splash-1320x2868.png":"e5df5a6ed4","icons/splash-750x1334.png":"58b2376cbc","icons/splash-828x1792.png":"f97579add4","index.html":"3358dd640e","layout.js":"9a062d46be","manifest.webmanifest":"ab4268b7c2","map.js":"95aeba9d6e","network.js":"d3d5fd85d8","quran-gpu.js":"fb35359c7c","same-count.js":"027ac9ceae","search-sheet.js":"839bd5afd2","search.js":"04c740f11c","sheet.js":"6d07d7c393","tafsir/SOURCES.md":"3df7af7ed1","tafsir/jalalayn/t001.json":"224580e74c","tafsir/jalalayn/t002.json":"db3e925cce","tafsir/jalalayn/t003.json":"be990068fc","tafsir/jalalayn/t004.json":"3e8c7828e5","tafsir/jalalayn/t005.json":"8bbe7abb87","tafsir/jalalayn/t006.json":"6a548caede","tafsir/jalalayn/t007.json":"8143abb2c3","tafsir/jalalayn/t008.json":"bcc92acdef","tafsir/jalalayn/t009.json":"ef6a959886","tafsir/jalalayn/t010.json":"d9ad704276","tafsir/jalalayn/t011.json":"dc338afa1a","tafsir/jalalayn/t012.json":"acea512240","tafsir/jalalayn/t013.json":"918f2e11b4","tafsir/jalalayn/t014.json":"405a6ec899","tafsir/jalalayn/t015.json":"eff45da017","tafsir/jalalayn/t016.json":"57ee8ea130","tafsir/jalalayn/t017.json":"566f5747a6","tafsir/jalalayn/t018.json":"a8ef0e6c1f","tafsir/jalalayn/t019.json":"05f17ca413","tafsir/jalalayn/t020.json":"78bd1d88c1","tafsir/jalalayn/t021.json":"d27b25b29a","tafsir/jalalayn/t022.json":"80fe17c359","tafsir/jalalayn/t023.json":"913177fc47","tafsir/jalalayn/t024.json":"c5ef58968b","tafsir/jalalayn/t025.json":"9c4e28046a","tafsir/jalalayn/t026.json":"0143dc6036","tafsir/jalalayn/t027.json":"7350df75e5","tafsir/jalalayn/t028.json":"696aebc20e","tafsir/jalalayn/t029.json":"c8b5381cc9","tafsir/jalalayn/t030.json":"d4fc6c33b1","tafsir/jalalayn/t031.json":"1bab2b1d40","tafsir/jalalayn/t032.json":"3947bc33ca","tafsir/jalalayn/t033.json":"3f2154c043","tafsir/jalalayn/t034.json":"dc94f6ba53","tafsir/jalalayn/t035.json":"2ed3e34ca9","tafsir/jalalayn/t036.json":"6597d67a54","tafsir/jalalayn/t037.json":"b969ad6287","tafsir/jalalayn/t038.json":"3d9dbf02c1","tafsir/jalalayn/t039.json":"a6cbf80943","tafsir/jalalayn/t040.json":"f24684ed3c","tafsir/jalalayn/t041.json":"7b331a9301","tafsir/jalalayn/t042.json":"448a09e3ac","tafsir/jalalayn/t043.json":"fa53c94e4d","tafsir/jalalayn/t044.json":"8e370a2d2b","tafsir/jalalayn/t045.json":"705bae2c06","tafsir/jalalayn/t046.json":"42c8c60318","tafsir/jalalayn/t047.json":"53af204ad6","tafsir/jalalayn/t048.json":"e900bd1b19","tafsir/jalalayn/t049.json":"39785659e2","tafsir/jalalayn/t050.json":"212eb243dd","tafsir/jalalayn/t051.json":"0050be3299","tafsir/jalalayn/t052.json":"b4f80236b5","tafsir/jalalayn/t053.json":"5d158782ad","tafsir/jalalayn/t054.json":"13a14a9287","tafsir/jalalayn/t055.json":"af8326d98c","tafsir/jalalayn/t056.json":"8b7634bdb5","tafsir/jalalayn/t057.json":"797ade544b","tafsir/jalalayn/t058.json":"af2be2a543","tafsir/jalalayn/t059.json":"91d72a63be","tafsir/jalalayn/t060.json":"7cb09cb275","tafsir/jalalayn/t061.json":"fc0e03ec15","tafsir/jalalayn/t062.json":"b23b0c5310","tafsir/jalalayn/t063.json":"38bb3af3b9","tafsir/jalalayn/t064.json":"0450ea161a","tafsir/jalalayn/t065.json":"e998dff45c","tafsir/jalalayn/t066.json":"04e8d8cbcd","tafsir/jalalayn/t067.json":"c1ca93361f","tafsir/jalalayn/t068.json":"ecd8a38a34","tafsir/jalalayn/t069.json":"598923eeec","tafsir/jalalayn/t070.json":"9a5e18c695","tafsir/jalalayn/t071.json":"d5e66ca10b","tafsir/jalalayn/t072.json":"d380add19a","tafsir/jalalayn/t073.json":"dd16612e36","tafsir/jalalayn/t074.json":"dae071b056","tafsir/jalalayn/t075.json":"1c5502deb0","tafsir/jalalayn/t076.json":"5464e22bf0","tafsir/jalalayn/t077.json":"2009d197dd","tafsir/jalalayn/t078.json":"e2ce9a9df4","tafsir/jalalayn/t079.json":"67c640415e","tafsir/jalalayn/t080.json":"78732d3ee4","tafsir/jalalayn/t081.json":"af96899c23","tafsir/jalalayn/t082.json":"6c11227448","tafsir/jalalayn/t083.json":"8679d8afc4","tafsir/jalalayn/t084.json":"e843fa6229","tafsir/jalalayn/t085.json":"3a76747f85","tafsir/jalalayn/t086.json":"d9cefe17c8","tafsir/jalalayn/t087.json":"4e9cdc2ba9","tafsir/jalalayn/t088.json":"3fd991e877","tafsir/jalalayn/t089.json":"f8f3389328","tafsir/jalalayn/t090.json":"87f8af7328","tafsir/jalalayn/t091.json":"21e9816d74","tafsir/jalalayn/t092.json":"e2f267a49e","tafsir/jalalayn/t093.json":"e54bc94522","tafsir/jalalayn/t094.json":"15c45b79c5","tafsir/jalalayn/t095.json":"dfca6a9ea7","tafsir/jalalayn/t096.json":"adb5bab73b","tafsir/jalalayn/t097.json":"b853cab4e9","tafsir/jalalayn/t098.json":"fdbaed58ee","tafsir/jalalayn/t099.json":"c3c3445fd2","tafsir/jalalayn/t100.json":"fef33725ae","tafsir/jalalayn/t101.json":"ed18822b1d","tafsir/jalalayn/t102.json":"0461d15c69","tafsir/jalalayn/t103.json":"19857c24cc","tafsir/jalalayn/t104.json":"d4e2f4a361","tafsir/jalalayn/t105.json":"f9114d56d1","tafsir/jalalayn/t106.json":"24df8ede0d","tafsir/jalalayn/t107.json":"2af580b791","tafsir/jalalayn/t108.json":"e5e480bf44","tafsir/jalalayn/t109.json":"4a4381e992","tafsir/jalalayn/t110.json":"6249b94c61","tafsir/jalalayn/t111.json":"0df20488fb","tafsir/jalalayn/t112.json":"8facb73583","tafsir/jalalayn/t113.json":"b808ad503f","tafsir/jalalayn/t114.json":"5f976ef5e2","tafsir/metadata.json":"834ab05286","tafsir/muntakhab/t001.json":"09874c9771","tafsir/muntakhab/t002.json":"233eca6bc8","tafsir/muntakhab/t003.json":"d444366d91","tafsir/muntakhab/t004.json":"d2c9054cc6","tafsir/muntakhab/t005.json":"e4eb1b00bf","tafsir/muntakhab/t006.json":"cffb7300db","tafsir/muntakhab/t007.json":"0b2028b7c2","tafsir/muntakhab/t008.json":"105cc1c4d9","tafsir/muntakhab/t009.json":"32a2468d65","tafsir/muntakhab/t010.json":"37aa7d0333","tafsir/muntakhab/t011.json":"c18c84fb13","tafsir/muntakhab/t012.json":"0f7521a4ab","tafsir/muntakhab/t013.json":"e56efb0231","tafsir/muntakhab/t014.json":"040eae1977","tafsir/muntakhab/t015.json":"ebb365ffc1","tafsir/muntakhab/t016.json":"52973b3318","tafsir/muntakhab/t017.json":"877894b363","tafsir/muntakhab/t018.json":"45efab18a4","tafsir/muntakhab/t019.json":"34a867fe5b","tafsir/muntakhab/t020.json":"5d872a6534","tafsir/muntakhab/t021.json":"ef573986eb","tafsir/muntakhab/t022.json":"96415a3f2d","tafsir/muntakhab/t023.json":"9fe11ace88","tafsir/muntakhab/t024.json":"03a1be0e93","tafsir/muntakhab/t025.json":"256f25d67c","tafsir/muntakhab/t026.json":"a43cf79a59","tafsir/muntakhab/t027.json":"b9d86875fc","tafsir/muntakhab/t028.json":"cfd78ddca8","tafsir/muntakhab/t029.json":"e280a06a66","tafsir/muntakhab/t030.json":"f369e5a0da","tafsir/muntakhab/t031.json":"190fee9daf","tafsir/muntakhab/t032.json":"dbc82f262e","tafsir/muntakhab/t033.json":"167a407039","tafsir/muntakhab/t034.json":"ccea6f445b","tafsir/muntakhab/t035.json":"7aed1917c7","tafsir/muntakhab/t036.json":"ddc07a7926","tafsir/muntakhab/t037.json":"58ef21845b","tafsir/muntakhab/t038.json":"78f85dd3e6","tafsir/muntakhab/t039.json":"a78b532453","tafsir/muntakhab/t040.json":"73c46e99b4","tafsir/muntakhab/t041.json":"60a8e50199","tafsir/muntakhab/t042.json":"7f3a059078","tafsir/muntakhab/t043.json":"47bae82df2","tafsir/muntakhab/t044.json":"935764440b","tafsir/muntakhab/t045.json":"8e5dc01b90","tafsir/muntakhab/t046.json":"d9cd4f0ce1","tafsir/muntakhab/t047.json":"e3f2c645dd","tafsir/muntakhab/t048.json":"b6f1a2182c","tafsir/muntakhab/t049.json":"9ddc550d7b","tafsir/muntakhab/t050.json":"85ecf8514f","tafsir/muntakhab/t051.json":"c2d1d3c661","tafsir/muntakhab/t052.json":"52b5e640d3","tafsir/muntakhab/t053.json":"e75e68809f","tafsir/muntakhab/t054.json":"a084e68a0f","tafsir/muntakhab/t055.json":"45dbc6a7ef","tafsir/muntakhab/t056.json":"cf172c6256","tafsir/muntakhab/t057.json":"7d58e0e5c6","tafsir/muntakhab/t058.json":"b7ce834592","tafsir/muntakhab/t059.json":"272b102c51","tafsir/muntakhab/t060.json":"bd95d8e0d9","tafsir/muntakhab/t061.json":"5326c2e2bf","tafsir/muntakhab/t062.json":"61e994f3d5","tafsir/muntakhab/t063.json":"9e963815ab","tafsir/muntakhab/t064.json":"8658dabe85","tafsir/muntakhab/t065.json":"acce152553","tafsir/muntakhab/t066.json":"ce214b9f4a","tafsir/muntakhab/t067.json":"f9d9be9e09","tafsir/muntakhab/t068.json":"50edcadea0","tafsir/muntakhab/t069.json":"f7111cbfc7","tafsir/muntakhab/t070.json":"1919c1ad92","tafsir/muntakhab/t071.json":"1c7f387851","tafsir/muntakhab/t072.json":"7f1908b484","tafsir/muntakhab/t073.json":"ba2f0334ae","tafsir/muntakhab/t074.json":"57e431595a","tafsir/muntakhab/t075.json":"0ef5967832","tafsir/muntakhab/t076.json":"d8db37a8c1","tafsir/muntakhab/t077.json":"e219094f4e","tafsir/muntakhab/t078.json":"69ff170e5e","tafsir/muntakhab/t079.json":"b74d134fba","tafsir/muntakhab/t080.json":"7ec540e527","tafsir/muntakhab/t081.json":"4199b028b7","tafsir/muntakhab/t082.json":"ae2a7b048d","tafsir/muntakhab/t083.json":"d05bd20cfa","tafsir/muntakhab/t084.json":"f5149d6bbd","tafsir/muntakhab/t085.json":"200315997c","tafsir/muntakhab/t086.json":"171d27b9fd","tafsir/muntakhab/t087.json":"c6134f98ae","tafsir/muntakhab/t088.json":"85afc75048","tafsir/muntakhab/t089.json":"d9b2a53c06","tafsir/muntakhab/t090.json":"83b8723b56","tafsir/muntakhab/t091.json":"3c6a2494f3","tafsir/muntakhab/t092.json":"fad0aa41f7","tafsir/muntakhab/t093.json":"91193a0f59","tafsir/muntakhab/t094.json":"fa870f7313","tafsir/muntakhab/t095.json":"95dfb00c4d","tafsir/muntakhab/t096.json":"158842cb0d","tafsir/muntakhab/t097.json":"30f6df42fb","tafsir/muntakhab/t098.json":"edb9c59e3b","tafsir/muntakhab/t099.json":"09b76f249e","tafsir/muntakhab/t100.json":"22d6e4c2b2","tafsir/muntakhab/t101.json":"6cdb814f81","tafsir/muntakhab/t102.json":"0b120ee431","tafsir/muntakhab/t103.json":"8878929b8e","tafsir/muntakhab/t104.json":"09676711da","tafsir/muntakhab/t105.json":"e229bfe9a6","tafsir/muntakhab/t106.json":"823e1353ff","tafsir/muntakhab/t107.json":"00822d1b1f","tafsir/muntakhab/t108.json":"acdbab9ef6","tafsir/muntakhab/t109.json":"23b1b0c394","tafsir/muntakhab/t110.json":"186cee3d3f","tafsir/muntakhab/t111.json":"f681e8da9c","tafsir/muntakhab/t112.json":"f3f6b2fe24","tafsir/muntakhab/t113.json":"20861f0c27","tafsir/muntakhab/t114.json":"bd32155bfc","track.js":"f7aa5a0e27","vendor/fonts-amiri-quran-v19/amiri-quran-arabic.woff2":"35f4f02bbd","vendor/fonts-amiri-quran-v19/amiri-quran-latin.woff2":"d35dc66f21","vendor/handwired-4ea7fcb/handwired.js":"6fe1f5a7a7","vendor/handwired-gpu-4ea7fcb/handwired-gpu.js":"fa3586eb47","vendor/oyen-face-d00ce3e/mark-data.js":"055cb37183","vendor/oyen-face-d00ce3e/oyen-face.js":"ca5e0818d3"}/*END*/;
const VERSION = /*VERSION*/"20261101T061521Z-33935e4"/*END*/;

const CACHE = `quran-${VERSION}`;
const LEGACY = 'quran-files';                                  // the one cache of the first offline copy
// The caches of older releases: VERSION starts with the release's UTC time, so their names sort before this one's.
const isOlder = (name) => name === LEGACY || (name.startsWith('quran-') && name < CACHE);
const BASE = new URL('./', self.location.href).href;          // the site's root, e.g. https://quran.oyenza.com/
const BASE_PATH = new URL(BASE).pathname;
const SHELL_DATA = new Set(['data/index.json', 'data/roots.json', 'data/s001.json', 'data/id/t001.json', 'data/links/l001.json']);
// The big install icons and the launch screens are left out: the phone fetches them itself when the app is installed,
// and most visitors never need them. The tab icons and the home-screen icon iOS reads are in.
const isShell = (p) => p === 'index.html' || p === 'gulir.html' || p === 'gulir.css' || p === 'manifest.webmanifest' || /^[^/]+\.js$/.test(p)
  || p.startsWith('vendor/') || (p.startsWith('icons/') && !/^icons\/(icon-|splash)/.test(p)) || SHELL_DATA.has(p);
const isData = (p) => p.startsWith('data/');
const keyOf = (p) => `${BASE}${encodeURI(p)}?h=${FILES[p]}`;

// The page path a request asks for: "" and folders mean their index.html. null for anything outside the site.
function pathOf(url) {
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE_PATH)) return null;
  let p;
  try { p = decodeURIComponent(url.pathname.slice(BASE_PATH.length)); } catch { return null; }
  const html = `${p.replace(/\/$/, '')}.html`;
  if (Object.prototype.hasOwnProperty.call(FILES, html)) return html;
  return p === '' || p.endsWith('/') ? `${p}index.html` : p;
}

const fail = (code, message) => Object.assign(new Error(message), { code });
let updateAsked = 0;
const askForUpdate = () => {
  if (Date.now() - updateAsked < 60000) return;
  updateAsked = Date.now();
  self.registration.update().catch(() => {});
};

async function hashOf(buf) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  let s = '';
  for (let k = 0; k < 5; k++) s += d[k].toString(16).padStart(2, '0');
  return s;
}

// One file from the network at its hashed address. A whole, matching copy is kept (strict: a cache error is thrown,
// for the download; else it is only not kept). Returns the page's response either way, and whether it was kept.
async function fromNetwork(cache, p, strict = false) {
  let res;
  // Cloudflare canonicalizes index.html to /; fetch its canonical URL so installation needs no redirect.
  // Keep the stable index.html cache key and verify the bytes exactly like every other release asset.
  const url = p === 'index.html' ? `${BASE}?h=${FILES[p]}` : keyOf(p);
  // Other HTML may use extensionless canonical URLs; mode and byte hashes still constrain every response.
  try { res = await fetch(url, { cache: 'no-cache', credentials: 'same-origin', mode: 'same-origin', redirect: p.endsWith('.html') ? 'follow' : 'error' }); }
  catch (err) { throw fail('offline', `${p}: ${err.message || err}`); }
  if (!res.ok || res.type !== 'basic') return { res, bytes: 0, kept: false };
  const body = await res.arrayBuffer();
  const headers = new Headers(res.headers);
  headers.delete('content-encoding');                         // the body is already decoded
  headers.delete('content-length');
  headers.set('x-bytes', String(body.byteLength));            // for cache-status, without reading every body back
  const copy = new Response(body, { status: res.status, statusText: res.statusText, headers });
  const kept = (await hashOf(body)) === FILES[p];
  // Not this worker's copy: a newer release is live. The page still gets the bytes, and the browser is asked for the
  // newer worker, which the page lets take over the next time it is out of sight.
  if (!kept) askForUpdate();
  if (kept) {
    try { await cache.put(keyOf(p), copy.clone()); }
    catch (err) {
      if (strict) throw err.name === 'QuotaExceededError' ? fail('quota', `${p}: storage is full`) : err;
      return { res: copy, bytes: body.byteLength, kept: false };
    }
  }
  return { res: copy, bytes: body.byteLength, kept };
}

// The site's shield lets one address make 20 requests a second with a burst of 200 (nginx limit_req, and a phone
// network can share one address among many people). So the install and the download draw from a bucket of 100 that
// refills 15 a second, and a 429 or 503 waits (1, 2, 4, 8, 16 s) and tries again. A network failure gets one more
// try; a full disk or a changed file gets none.
const bucket = { tokens: 100, at: Date.now() };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function slot() {
  for (;;) {
    const now = Date.now();
    bucket.tokens = Math.min(100, bucket.tokens + ((now - bucket.at) / 1000) * 15);
    bucket.at = now;
    if (bucket.tokens >= 1) { bucket.tokens -= 1; return; }
    await sleep(Math.ceil(((1 - bucket.tokens) / 15) * 1000));
  }
}
async function fetchKept(cache, p) {
  for (let attempt = 0; ; attempt++) {
    await slot();
    let got;
    try { got = await fromNetwork(cache, p, true); } catch (err) {
      if (err.code !== 'offline' || attempt >= 1) throw err;
      await sleep(500);
      continue;
    }
    if ((got.res.status === 429 || got.res.status === 503) && attempt < 5) { await sleep(1000 * 2 ** attempt); continue; }
    return got;
  }
}

// Runs fn over items, n at a time; the first failure stops new work and is thrown when the running ones end.
async function pool(items, n, fn) {
  let next = 0, failed = null;
  const worker = async () => {
    while (!failed && next < items.length) {
      const item = items[next++];
      try { await fn(item); } catch (err) { failed ??= err; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  if (failed) throw failed;
}

const keptUrls = async (cache) => new Set((await cache.keys()).map((r) => r.url));

// Copies keys into this release's cache from `from`: one cache, or every cache (caches.match looks in all of them and
// opens none by name, so a cache deleted meanwhile is never made again). One key is one file's bytes, whichever cache
// holds it. Once the store is full nothing more is tried. Returns the keys not copied that were there, or could not be
// read (`held`: every key is known to be in an older cache, so one not found counts too).
async function copyIn(cache, keys, from = caches, held = false) {
  const failed = [];
  let full = false;
  await pool(keys, 8, async (key) => {
    let res;
    try { res = await from.match(key); } catch { failed.push(key); return; }
    if (!res) { if (held) failed.push(key); return; }
    if (full) { failed.push(key); return; }
    try { await cache.put(key, res); } catch (err) {
      failed.push(key);
      if (err?.name === 'QuotaExceededError') full = true;
    }
  });
  return failed;
}

// The install: the shell first, copied from an older release's cache where it did not change, else fetched: it is
// what the install needs. Then every other file kept under an older release (the surahs read or downloaded), while the
// store has room; whatever is not copied now is moved when this release takes over (settle).
async function fill(cache) {
  const have = await keptUrls(cache);
  const missing = Object.keys(FILES).filter((p) => !have.has(keyOf(p)));
  const shell = missing.filter(isShell);
  await copyIn(cache, shell.map(keyOf));
  const copied = await keptUrls(cache);
  await pool(shell.filter((p) => !copied.has(keyOf(p))), 4, async (p) => {
    const got = await fetchKept(cache, p);
    // a file that does not match this worker means another release went live while it installed: the install fails
    // and the browser tries the newer worker on a later visit
    if (!got.kept) throw fail(got.res.ok ? 'changed' : 'http', `${p}: ${got.res.ok ? 'not this release' : `HTTP ${got.res.status}`}`);
  });
  await copyIn(cache, missing.filter((p) => !isShell(p)).map(keyOf));
}

async function precache() {
  for (let attempt = 0; ; attempt++) {
    const made = !(await caches.has(CACHE));
    try {
      let err = null;
      try { await fill(await caches.open(CACHE)); } catch (e) { err = e; }
      const kept = (await caches.has(CACHE)) ? await keptUrls(await caches.open(CACHE)) : null;
      if (!err && kept && Object.keys(FILES).every((p) => !isShell(p) || kept.has(keyOf(p)))) return;
      // The cache can be deleted while it is filled (the first offline copy's worker deletes every cache but its own
      // when it activates): it is filled again, once.
      if (!kept && attempt < 1) continue;
      throw err ?? fail('storage', 'the offline store was deleted while it was filled');
    } catch (err) {
      // a failed install leaves no half-filled cache behind, to hold its room on every later try
      if (made) await caches.delete(CACHE).catch(() => {});
      throw err;
    }
  }
}

// When this release takes over: every file it uses that an older cache holds and this one does not (kept by the older
// release while this one waited, or not copied at install while the store was full) is copied in, and the older
// caches go. If any file does not copy (the store has no room, or a read fails), the older caches' copies of what this
// cache holds (and of files this release does not use) are dropped first, and the files left are moved one at a time
// (copied, then deleted where they were), so the room one frees takes the next. An older cache still holding a file
// that would not move stays, with only those files: matchIn reads from it until a later release moves them.
async function settle() {
  const cache = await caches.open(CACHE);
  const names = (await caches.keys()).filter(isOlder);
  const held = new Set();
  for (const name of names) for (const k of await keptUrls(await caches.open(name))) held.add(k);
  const have = await keptUrls(cache);
  const move = Object.keys(FILES).map(keyOf).filter((k) => held.has(k) && !have.has(k));
  const left = new Set(await copyIn(cache, move, caches, true));
  if (left.size) {
    for (const name of names) {
      const old = await caches.open(name);
      for (const r of await old.keys()) if (!left.has(r.url)) await old.delete(r);
    }
    for (const name of names) {
      const old = await caches.open(name);
      for (const r of await old.keys()) {
        if (!left.has(r.url)) { await old.delete(r); continue; }     // moved already, from another older cache
        try {
          const res = await old.match(r);
          if (!res) continue;
          await cache.put(r, res);
          left.delete(r.url);
          await old.delete(r);
        } catch { /* it stays where it is */ }
      }
    }
  }
  for (const name of names) {
    const old = await caches.open(name);
    if (!(await old.keys()).some((r) => left.has(r.url))) await caches.delete(name);
  }
}

// After settle: a shell file still missing (the cache deleted after the install checked it, as the first offline
// copy's worker can do) is fetched again. Pages wait for the activation, so this waits 5 s at most; the rest is
// fetched when a page asks for it.
async function topUp(cache) {
  const kept = await keptUrls(cache);
  const missing = Object.keys(FILES).filter((p) => isShell(p) && !kept.has(keyOf(p)));
  if (missing.length) await Promise.race([pool(missing, 4, (p) => fromNetwork(cache, p).catch(() => {})), sleep(5000)]);
}

// A cache that cannot be opened or read (a private window, a full or broken store) is treated as empty. A file this
// release's cache does not hold may still be in an older one (a move the full store had no room for): the key names
// its bytes, so that copy is as good.
const openCache = () => caches.open(CACHE).catch(() => null);
const matchIn = async (cache, key) => (cache && await cache.match(key).catch(() => undefined))
  || caches.match(key).catch(() => undefined);
const NO_CACHE = { put: async () => { throw fail('storage', 'the offline store cannot be opened'); } };

async function answer(p, nav, request) {
  const cache = await openCache();
  const hit = await matchIn(cache, keyOf(p));
  if (hit) return hit;
  try {
    return (await fromNetwork(cache ?? NO_CACHE, p)).res;
  } catch {
    if (nav) {
      // a page load of a file not kept (/data/s002.json typed in) goes to the site's root, like any unknown address
      if (p !== 'index.html') return Response.redirect(BASE, 302);
      const shell = FILES['index.html'] && await matchIn(cache, keyOf('index.html'));
      if (shell) return shell;
    }
    // no copy and no network: let the browser try once more on its own
    return fetch(request).catch(() => Response.error());
  }
}

// A page outside the files (a mistyped or old address): the network, and offline the site's own page at its root,
// because a copy of index.html served at /some/path/ would look for its scripts under /some/path/.
async function shellOr(request) {
  try { return await fetch(request); } catch (err) {
    if (new URL(request.url).pathname !== BASE_PATH) return Response.redirect(BASE, 302);
    const shell = FILES['index.html'] && await matchIn(await openCache(), keyOf('index.html'));
    if (shell) return shell;
    throw err;
  }
}

// ---------------------------------------------------------------- download-all and cache-status
let run = null;
const listeners = new Set();
const tell = (m) => { for (const say of listeners) say(m); };

function downloadAll(say) {
  listeners.add(say);
  run ??= downloadRun().finally(() => { run = null; listeners.clear(); });
  return run;
}

async function downloadRun() {
  if (!FILES) { tell({ type: 'download-error', code: 'off', message: 'this build keeps no offline copy', done: 0, total: 0 }); return; }
  const data = Object.keys(FILES).filter(isData);
  const total = data.length;
  let done = 0, bytes = 0;
  try {
    const cache = await caches.open(CACHE).catch((err) => { throw fail('storage', String(err?.message ?? err)); });
    const have = await keptUrls(cache).catch((err) => { throw fail('storage', String(err?.message ?? err)); });
    const todo = data.filter((p) => !have.has(keyOf(p)));
    done = total - todo.length;
    tell({ type: 'download-progress', done, total, bytes });
    await pool(todo, 4, async (p) => {
      const got = await fetchKept(cache, p);
      if (!got.res.ok) throw fail('http', `${p}: HTTP ${got.res.status}`);
      if (!got.kept) throw fail('changed', `${p} is newer than this copy of the site`);
      done++; bytes += got.bytes;
      tell({ type: 'download-progress', done, total, bytes });
    });
    tell({ type: 'download-done', total, bytes });
  } catch (err) {
    tell({ type: 'download-error', code: err.code ?? 'offline', message: String(err.message ?? err), done, total });
  }
}

async function status() {
  const base = { type: 'cache-status', version: VERSION, on: !!FILES };
  if (!FILES) return { ...base, cachedData: 0, totalData: 0, bytes: 0 };
  const cache = await openCache();
  if (!cache) return { ...base, cachedData: 0, totalData: Object.keys(FILES).filter(isData).length, bytes: 0 };
  const data = Object.keys(FILES).filter(isData);
  let cachedData = 0, bytes = 0;
  await pool(data, 16, async (p) => {
    const hit = await matchIn(cache, keyOf(p));
    if (hit) { cachedData++; bytes += Number(hit.headers.get('x-bytes')) || 0; }
  });
  return { ...base, cachedData, totalData: data.length, bytes };
}

// ---------------------------------------------------------------- the worker's events
if (FILES === false) {
  // the off switch: take over now, forget everything, leave. No claim, so an open page is not told to reload.
  self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
  self.addEventListener('activate', (event) => event.waitUntil((async () => {
    for (const name of await caches.keys()) await caches.delete(name);
    await self.registration.unregister();
  })()));
} else if (FILES) {
  self.addEventListener('install', (event) => event.waitUntil(precache()));
  self.addEventListener('activate', (event) => event.waitUntil((async () => {
    // older releases' files move in, their caches go; a newer release's cache stays (its worker may be installing)
    try { await settle(); } catch { /* a store that cannot be cleaned now is cleaned by the next release */ }
    try { await topUp(await caches.open(CACHE)); } catch { /* fetched when a page asks for it */ }
    await self.clients.claim();
  })()));
  self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    const p = pathOf(url);
    if (p === null || p.startsWith('api/')) return;
    const nav = req.mode === 'navigate';
    if (Object.prototype.hasOwnProperty.call(FILES, p)) event.respondWith(answer(p, nav, req));
    else if (nav) event.respondWith(shellOr(req));
  });
}

self.addEventListener('message', (event) => {
  const msg = event.data ?? {};
  const to = event.source;
  const say = (m) => { try { to?.postMessage(m); } catch { /* the page has gone */ } };
  if (msg.type === 'skip-waiting') event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (open.length <= 1) await self.skipWaiting();
  })());
  else if (msg.type === 'cache-status') event.waitUntil(status().then(say));
  else if (msg.type === 'download-all') event.waitUntil(downloadAll(say));
});
