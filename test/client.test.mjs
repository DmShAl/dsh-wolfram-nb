// Loads client.js in a stub DOM and checks that the composer chip is registered
// and that a click runs the host `/initmath` command.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const HERE = dirname(fileURLToPath(import.meta.url))
const SOURCE = readFileSync(join(HERE, '..', 'client.js'), 'utf8')

function fakeReact() {
  return {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children, key: props?.key }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useRef: () => ({ current: null }),
    useEffect: () => {},
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    Fragment: 'fragment',
  }
}

function loadClient() {
  let mod = null
  const styleTags = []
  const document = {
    head: { appendChild: (tag) => styleTags.push(tag) },
    createElement: () => ({ setAttribute() {}, textContent: '' }),
    addEventListener() {},
    removeEventListener() {},
    body: {},
  }
  const window = {
    __ModuleLoader__: { load: ({ factory }) => { mod = factory(() => fakeReact()) } },
  }
  const sandbox = {
    window,
    document,
    React: fakeReact(),
    console,
    setTimeout,
    clearTimeout,
    AbortController,
    JSON,
    Math,
    Date,
    Node: class {},
  }
  vm.createContext(sandbox)
  vm.runInContext(SOURCE, sandbox)
  assert.ok(mod !== null, 'client.js did not register a module')
  return { mod, styleTags }
}

function makeContext() {
  const slots = []
  const ctx = {
    effect(fn) { const cleanup = fn(); return cleanup },
    get() { return undefined },
    locale: { register() {}, bind: () => (key) => key },
    sidebarRightTabs: { register() {} },
    sidebarRight: {},
    remote: {
      commands: { execute: async () => ({ kind: 'success', text: 'Prepared D:\\work: 11 file(s) written' }) },
      workspaceFiles: {},
    },
    slots: {
      inject(name, fn) { return fn() },
      register(spec, component) { slots.push({ spec, component }); return { spec, component } },
    },
  }
  return { ctx, slots }
}

test('the client registers an InitMath chip in the composer', () => {
  const { mod, styleTags } = loadClient()
  const { ctx, slots } = makeContext()
  mod.apply(ctx)

  const chip = slots.find((entry) => entry.spec.name === 'conversation.input.left')
  assert.ok(chip !== undefined, 'no chip registered for conversation.input.left')
  assert.equal(chip.spec.id, 'dsh-wolfram-nb-initmath')
  assert.equal(chip.spec.label(), 'init.chip')
  assert.ok(styleTags.length >= 1, 'chip stylesheet was not installed')
})

test('the chip runs /initmath through the host command channel', async () => {
  const { mod } = loadClient()
  const { ctx, slots } = makeContext()
  const executed = []
  ctx.remote.commands.execute = async (session, input) => {
    executed.push({ session, input })
    return { kind: 'success', text: 'Prepared D:\\work: 11 file(s) written' }
  }
  mod.apply(ctx)

  const chip = slots.find((entry) => entry.spec.name === 'conversation.input.left')
  const tree = chip.component({ sessionId: 'session-1', t: (key) => key })
  const button = tree.children.find((child) => child !== null && child?.type === 'button')
  assert.ok(button !== undefined, 'chip has no button')
  await button.props.onClick()
  assert.equal(executed.length, 1)
  assert.equal(executed[0].session, 'session-1')
  assert.equal(executed[0].input, '/initmath')
})
