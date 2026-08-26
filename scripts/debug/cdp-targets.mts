const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json())
console.log(JSON.stringify(list.map((t) => ({ type: t.type, url: t.url.slice(0, 70), title: (t.title || '').slice(0, 40) })), null, 1))
