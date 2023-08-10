import {Runtime, Inspector, Library} from 'https://cdn.jsdelivr.net/npm/@observablehq/runtime@5.8.2/+esm'
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.0.5/+esm'

window.addEventListener("load", async () => {
  const wiki = {}

  function linked(text) {
    return text
      .replace(/\[\[(.*?)\]\]/g, (_,title) => `<a class="internal" data-title="${title}" href="#">${title}</a>`)
      .replace(/\[(https?:.*?) (.*?)\]/g, (_,url,word) => `<a href="${url.replace(/^https?:/,'')}">${word}</a>`)
  }

  function annotateLinks(el) {
    el.querySelectorAll('a').forEach(a => {
      if (a.classList.contains('internal')) {
        a.onclick = event => {
          let {title} = event.target.dataset.title
          // TODO do the internal link thing
        }
      } else {
        a.setAttribute('target', '_blank')
      }
    })
    return el
  }

  const lib = new Library()
  Object.assign(wiki, {
    runtime: new Runtime(Object.assign(lib, {
      toJSON: () => obj => JSON.stringify(obj, null, 2),
      //html: brokenSanitizeAdaptor(lib)
    })),
    lineup: [],
    plugins: [
      {
        type: 'unknown',
        deps: ['html'],
        fn: item => (html) => {
          const div = document.createElement('div')
          div.classList.add('item', 'unknown')
          const inspector = new Inspector(div)
          inspector.fulfilled(item)
          div.prepend(html`<p><em>Unknown type:</em> ${item.type}`)
          return div
        }
      },
      {
        type: 'paragraph',
        deps: ['html'],
        fn: item => html => annotateLinks(html`<p>${linked(item.text)}`)
      },
      {
        type: 'html',
        deps: ['html'],
        fn: item => html => annotateLinks(html`${linked(item.text)}`)
      },
      {
        type: 'markdown',
        deps: ['md'],
        fn: item => md => annotateLinks(md`${linked(item.text)}`)
      }
    ],
    addPanel(panel, replaceId=null) {
      if (!replaceId) {
        wiki.lineup.push(panel)
        const module = panelModule(wiki.runtime, panel)
      }
    },
    findPage({title, context=[]}) {
      for(let siteMap of context) {
        for(let page of Object.values(siteMap)) {
          if (page.title.toLowerCase() == title.toLowerCase()) {
            return page
          }
        }
      }
      return {}
    },
    ghost,
    randomId,
    sitemap,
    panel
  })

  window.wiki = wiki

  wiki.lineup =
    [
      'Zip',
      'Zippity Doo Dah. Zippity Eh. My, oh my.',
      'Hello, World!',
      'Welcome Visitors'
    ].map(title => ghost(title, [
      {
        text:"This is a paragraph. With an unexpanded [[Internal Link]]"
      },
      {
        type:"markdown",
        text:"This paragraph _has markdown_. [Markdown Link](//wiki.dbbs.co/apparatus.html)\n\n[https://wander.dbbs.co/commonplace-book.html External Link]"
      },
      ...(Array.from({length:Math.round(Math.random()*4)+2}, _ => ({
        text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
      })))
    ]))
})

function panelAdaptor({id, flag, page: {title, story=[], journal=[]}}) {
  // TODO maybe change flag to site and lookup the flag from the site
  return function define(runtime, observer) {
    const main = runtime.module()
    // TODO main.variable(observer('twins')).define(/* ... */)
    main.variable(observer('title')).define('title', () => title)
    for(let item of story) {
      // Using item.id to name the Observable variables. Not sure this
      // will be useful. Although id collisions are very unlikely,
      // they are not impossible and they will be very confusing to
      // debug. maybe TODO: guarantee uniqueness here
      //
      // Speculate that wiki's look-left pattern can be represented in
      // Observable by using variable.import() in page modules to the
      // right pulling variables from pages modules to their left.
      // https://github.com/observablehq/runtime#variable_import

      // TODO: wrap this function in some way to inject the wiki
      // dependency, or more specifically, the plugins, instead of
      // using a global here
      let plugin = window.wiki.plugins.find(({type}) => type == item.type)
      plugin ||= window.wiki.plugins.find(({type}) => type == 'unknown')
      main.variable(observer(`item${item.id}`))
        .define(`item${item.id}`, plugin.deps, plugin.fn(item))
    }
    const deps = ['html', ...story.map(item => `item${item.id}`)]
    main.variable(observer('panel'))
      .define('panel', deps, (html, ...story) => {
        return html`
          <article id="panel${id}">
          <div class=twins></div>
          <header><h1><img src="${flag}"> ${title}</h1></header>
          ${story}
          <footer></footer>
          </article>`
      })
    // TODO for(let edit of journal) {/*...*/}
  }
}

function panelModule(runtime, panel) {
  return runtime.module(
    panelAdaptor(panel),
    name => {
      if (name == 'panel') {
        return Inspector.into('main')()
      }
      return null
    }
  )
}

function randomId() {
  let x = new Uint32Array(2)
  crypto.getRandomValues(x)
  return Array.from(x, i=>i.toString(16)).join('')
}

function ghost(title, story) {
  let page = {title, story: story.map(item => ({
    id: randomId(),
    type: 'paragraph',
    ...item
  }))}
  let journal = [{
    action: 'create',
    item: page,
    date: +(new Date())
  }]
  return {
    id: randomId(),
    flag: './icon-120.png',
    page: {
      ...page,
      journal
    }
  }
}

async function sitemap(domain) {
  try {
    const res = await fetch(`//${domain}/system/sitemap.json`)
    return res.json()
  } catch (error) {
    return {error}
  }
}

async function panel(domain, {slug}) {
  try {
    const res = await fetch(`//${domain}/${slug}.json`)
    return {
      id: randomId(),
      flag: `//${domain}/favicon.png`,
      page: await res.json()
    }
  } catch (error) {
    return {error}
  }
}

async function brokenSanitizeAdaptor(lib) {
/*
  TODO: This example of an embedded notebook probably has exactly the
  example needed to integrate Observable's htl library with DOMPurify:
  https://github.com/observablehq/examples/blob/main/custom-library/index.html
*/
  function sanitize(dirty) {
    return DOMPurify.sanitize(dirty, {
      // maybe also   RETURN_DOM: true,
      SANITIZE_DOM: false,
      ADD_TAGS: ['foreignObject', 'feDropShadow']
    });
  }

  const {htl:htlPromise} = lib
  const htl = await htlPromise()

  return function sanitizedTaggedTemplateLiteral(...args) {
    console.log({args})
    const firstPass = htl.html(...args)
    const html = sanitize(firstPass.outerHTML)
    const el = htl.html`${html}`
    // giving it back to Observable to conform with their API
    // ends up html encoding instead of leaving the html alone. :-(
    return el
  }
}
