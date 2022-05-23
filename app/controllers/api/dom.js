//
// Name:    scrape.js
// Purpose: Controller and routing for scraping
// Creator: Tom Söderlund
//

'use strict'

const { get, compact } = require('lodash')
const cheerio = require('cheerio')
const { parseRequestQuery, fetchPageWithPuppeteer } = require('../helpers')

const compactString = str => str.replace(/[\n\t]/g, '').replace(/\s+/g, ' ').trim()

const parseDOM = (domString, pageSel, complete, deep) => {
  // Use _ instead of . and $ instead of # to allow for easier JavaScript parsing
  const getElementReference = $element => ($element[0].name) + ($element.attr('class') ? '_' + $element.attr('class').replace(/ /g, '_') : '') + ($element.attr('id') ? '$' + $element.attr('id') : '')

  const traverseChildren = function (parentObj, obj, i, elem) {
    const $node = $(elem)
    const nodeRef = getElementReference($node)
    // Has children and is not a text node
    if ($node.children().length > 0 && typeof(obj[nodeRef]) !== 'string') {
      obj[nodeRef] = obj[nodeRef] || {}
      // Has children AND text: use '.$text='
      if ($node.text().length > 0) {
        obj[nodeRef].$text = compactString($node.text())
      }
      // Traverse the children
      $node.children().each(traverseChildren.bind(undefined, obj, obj[nodeRef]))
    } else {
      // Has only text
      obj[nodeRef] = compactString($node.text())
    }
    // Delete parent.$text if same as this
    if ($node.text() === get(parentObj, '$text')) {
      delete parentObj.$text
    }
  }

  const $ = cheerio.load(domString)
  console.log('* cheerio.load:\n', $(pageSel), domString, '\n END')
  const resultArray = $(pageSel).map(function (i, el) {
    // this === el
    if (complete) {
      // Complete DOM nodes
      return compactString($(this).toString())
    } else if (deep) {
      // Deep objects
      let deepObj = {}
      traverseChildren(undefined, deepObj, undefined, this)
      return deepObj
    } else {
      // Shallow text
      return compactString($(this).text())
    }
  }).get()
  return compact(resultArray)
}

const scrapePage = async function (req, res) {
  try {
    const query = parseRequestQuery(req.url)
    if (!query.url) throw new Error(`No "url" specified: ${req.url}`)
    const pageUrl = decodeURIComponent(query.url)
    // Use $ instead of # to allow for easier URL parsing
    const pageSelector = decodeURIComponent(query.selector || 'body').replace(/\$/g, '#')
    const loadExtraTime = query.time || 3000
    const deepResults = query.deep || false
    const completeResults = query.complete || false
    const timeStart = Date.now()

    console.log(`Scrape DOM: "${pageUrl}"`, { pageSelector, loadExtraTime })

    const documentHTML = await fetchPageWithPuppeteer(pageUrl, { loadExtraTime, bodyOnly: true })
    const selectorsArray = pageSelector.split(',')
    const resultsObj = selectorsArray.map(selector => {
      const items = parseDOM(documentHTML, selector, completeResults, deepResults)
      return { selector, count: items.length, items }
    })
    const timeFinish = Date.now()
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ time: (timeFinish - timeStart), results: resultsObj }))
  } catch (err) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ code: res.statusCode, message: err.message }))
    console.error(err.message)
  }
}

// Routes

module.exports = scrapePage
