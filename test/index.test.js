import test from 'ava'
import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'
import { MemoryBlockstore } from 'blockstore-core/memory'
import { fromString, toString } from 'uint8arrays'
import * as raw from 'multiformats/codecs/raw'
import * as dagPB from '@ipld/dag-pb'
import { UnixFS } from 'ipfs-unixfs'
import { sha256 } from 'multiformats/hashes/sha2'
import { CID } from 'multiformats/cid'
import { Miniswap, BITSWAP_PROTOCOL } from 'miniswap'
import { TimeoutController } from 'timeout-abort-controller'
import { Dagula } from '../index.js'
import { getLibp2p } from '../p2p.js'

test('should fetch a single CID', async t => {
  // create blockstore and add data
  const serverBlockstore = new MemoryBlockstore()
  const data = fromString(`TEST DATA ${Date.now()}`)
  const hash = await sha256.digest(data)
  const cid = CID.create(1, raw.code, hash)
  await serverBlockstore.put(cid, data)

  const server = await createLibp2p({
    addresses: { listen: ['/ip4/127.0.0.1/tcp/0/ws'] },
    transports: [webSockets()],
    streamMuxers: [mplex()],
    connectionEncryption: [noise()]
  })

  const miniswap = new Miniswap(serverBlockstore)
  server.handle(BITSWAP_PROTOCOL, miniswap.handler)

  await server.start()

  const libp2p = await getLibp2p()
  const dagula = await Dagula.fromNetwork(libp2p, { peer: server.getMultiaddrs()[0] })
  for await (const block of dagula.get(cid)) {
    t.is(block.cid.toString(), cid.toString())
    t.is(toString(block.bytes), toString(data))
  }
})

test('should walk a unixfs path', async t => {
  // create blockstore and add data
  const serverBlockstore = new MemoryBlockstore()
  const data = fromString(`TEST DATA ${Date.now()}`)
  const hash = await sha256.digest(data)
  const cid = CID.create(1, raw.code, hash)
  await serverBlockstore.put(cid, data)
  const linkName = 'foo'
  const dirData = new UnixFS({ type: 'directory' }).marshal()
  const dirBytes = dagPB.encode(dagPB.prepare({ Data: dirData, Links: [{ Name: linkName, Hash: cid }] }))
  const dirCid = CID.create(1, dagPB.code, await sha256.digest(dirBytes))
  await serverBlockstore.put(dirCid, dirBytes)

  const server = await createLibp2p({
    addresses: { listen: ['/ip4/127.0.0.1/tcp/0/ws'] },
    transports: [webSockets()],
    streamMuxers: [mplex()],
    connectionEncryption: [noise()]
  })

  const miniswap = new Miniswap(serverBlockstore)
  server.handle(BITSWAP_PROTOCOL, miniswap.handler)

  await server.start()

  const libp2p = await getLibp2p()
  const dagula = await Dagula.fromNetwork(libp2p, { peer: server.getMultiaddrs()[0] })
  const entries = []
  for await (const entry of dagula.walkUnixfsPath(`${dirCid}/${linkName}`)) {
    entries.push(entry)
  }
  t.is(entries.length, 2)
  t.deepEqual(entries.at(0).cid, dirCid)
  t.deepEqual(entries.at(0).bytes, dirBytes)
  t.deepEqual(entries.at(1).cid, cid)
  t.deepEqual(entries.at(1).bytes, data)
})

test('should abort a fetch', async t => {
  const server = await createLibp2p({
    addresses: { listen: ['/ip4/127.0.0.1/tcp/0/ws'] },
    transports: [webSockets()],
    streamMuxers: [mplex()],
    connectionEncryption: [noise()]
  })

  const miniswap = new Miniswap(new MemoryBlockstore())
  server.handle(BITSWAP_PROTOCOL, miniswap.handler)

  await server.start()

  const libp2p = await getLibp2p()
  const dagula = await Dagula.fromNetwork(libp2p, { peer: server.getMultiaddrs()[0] })
  // not in the blockstore so will hang indefinitely
  const cid = 'bafkreig7tekltu2k2bci74rpbyrruft4e7nrepzo4z36ie4n2bado5ru74'
  const controller = new TimeoutController(1_000)
  const err = await t.throwsAsync(() => dagula.getBlock(cid, { signal: controller.signal }))
  t.is(err?.name, 'AbortError')
})