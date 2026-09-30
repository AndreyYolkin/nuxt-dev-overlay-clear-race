import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const target = fileURLToPath(new URL('../app/app.vue', import.meta.url))
const healthy = readFileSync(target, 'utf8')
const broken = healthy.replace('    repro page is healthy\n', '    <span\n      repro page is healthy\n    </span>\n')

if (broken === healthy) {
  throw new Error('Could not prepare the compile error')
}

async function within(promise, label) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Timed out waiting for ' + label)), 15_000)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

test('a cleared report must not mount after its overlay response arrives', async ({ page }) => {
  test.setTimeout(60_000)

  let resolveClear
  const cleared = new Promise((resolve) => { resolveClear = resolve })
  page.on('websocket', (socket) => {
    socket.on('framereceived', ({ payload }) => {
      if (String(payload).includes('"event":"nuxt:dev:error:clear"')) {
        resolveClear()
      }
    })
  })

  await page.goto('/')
  await expect(page.locator('body')).toContainText('repro page is healthy')
  await page.waitForFunction(() => Boolean(document.querySelector('#__nuxt')?.__vue_app__))

  let releaseResponse
  const release = new Promise((resolve) => { releaseResponse = resolve })
  let captureResponse
  const captured = new Promise((resolve) => { captureResponse = resolve })
  await page.route('**/__nuxt_dev__/error-overlay/**', async (route) => {
    const response = await route.fetch()
    captureResponse(response.status())
    await release
    await route.fulfill({ response })
  })

  try {
    writeFileSync(target, broken)
    expect(await within(captured, 'the overlay request')).toBe(200)

    writeFileSync(target, healthy)
    await within(cleared, 'the clear HMR event')
    await expect(page.locator('nuxt-error-overlay')).toHaveCount(0)

    const delivered = page.waitForResponse(response => response.url().includes('/error-overlay/'))
    releaseResponse()
    const response = await delivered
    await response.finished()
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))

    const count = await page.locator('nuxt-error-overlay').count()
    expect(count).toBe(0)
  } finally {
    releaseResponse()
    writeFileSync(target, healthy)
  }
})
