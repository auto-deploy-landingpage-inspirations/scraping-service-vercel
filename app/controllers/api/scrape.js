//
// Name:    scrape.js
// Purpose: Controller and routing for scraping
// Creator: Tom Söderlund
//

'use strict'

const express = require('express')
const _ = require('lodash')
const cheerio = require('cheerio')
const helpers = require('../helpers')

const parseDOM = (domString, pageSel, complete, deep) => {
  // Use _ instead of . and $ instead of # to allow for easier JavaScript parsing
  const getElementReference = $element => ($element[0].name) + ($element.attr('class') ? '_' + $element.attr('class').replace(/ /g, '_') : '') + ($element.attr('id') ? '$' + $element.attr('id') : '')

  const traverseChildren = function (parentObj, obj, i, elem) {
    const $node = $(elem)
    const nodeRef = getElementReference($node)
    // Has children
    if ($node.children().length > 0) {
      obj[nodeRef] = obj[nodeRef] || {}
      // Has children AND text: use '.$text='
      if ($node.text().length > 0) {
        obj[nodeRef].$text = $node.text()
      }
      // Traverse the children
      $node.children().each(traverseChildren.bind(undefined, obj, obj[nodeRef]))
    } else {
      // Has only text
      obj[nodeRef] = $node.text()
    }
    // Delete parent.$text if same as this
    if ($node.text() === _.get(parentObj, '$text')) {
      delete parentObj.$text
    }
  }

  const $ = cheerio.load(domString)
  const resultArray = $(pageSel).map(function (i, el) {
    // this === el
    if (complete) {
      // Complete DOM nodes
      return $(this).toString()
    } else if (deep) {
      // Deep objects
      let deepObj = {}
      traverseChildren(undefined, deepObj, undefined, this)
      return deepObj
    } else {
      // Shallow text
      return $(this).text()
    }
  }).get()
  return resultArray
}

const scrapePage = function (req, res, next) {
  const pageUrl = decodeURIComponent(req.query.url)
  // Use $ instead of # to allow for easier URL parsing
  const pageSelector = decodeURIComponent(req.query.selector || 'body').replace(/\$/g, '#')
  const loadExtraTime = req.query.time || 0
  const deepResults = req.query.deep || false
  const completeResults = req.query.complete || false
  const timeStart = Date.now()

  console.log(`Scrape: "${pageUrl}", "${pageSelector}", ${loadExtraTime} ms`)

  helpers.fetchPageWithPuppeteer(pageUrl, { loadExtraTime, bodyOnly: true })
    .then(documentHTML => {
      const selectorsArray = pageSelector.split(',')
      const resultsObj = selectorsArray.map((selector) => {
        const items = parseDOM(documentHTML, selector, completeResults, deepResults)
        return { selector, count: items.length, items }
      })
      return resultsObj
    })
    .then(resultsObj => {
      const timeFinish = Date.now()
      res.json({ time: (timeFinish - timeStart), results: resultsObj })
    })
    .catch(err => {
      console.error('Error:', err)
      res.status(400).json({ error: err })
    })
}

// Routes

module.exports = function (app, config) {
  const router = express.Router()
  app.use('/', router)

  router.get('/api/scrape', scrapePage)
}