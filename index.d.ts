import type { BlockDecoder } from 'multiformats/codecs/interface'
import type { CID } from 'multiformats'
import type { UnixFSEntry } from 'ipfs-unixfs-exporter'

export interface BlockDecoders {
  [code: number]: BlockDecoder
}

export interface Block {
  cid: CID
  bytes: Uint8Array
}

export declare class Dagula {
  constructor (peer?: string|Multiaddr, options?: { decoders?: BlockDecoders })
  get (cid: CID|string, options?: { signal?: AbortSignal }): AsyncIterableIterator<Block>
  getBlock (cid: CID|string, options?: { signal?: AbortSignal }): Promise<Uint8Array>
  getUnixfs (path: CID|string, options?: { signal?: AbortSignal }): Promise<UnixFSEntry>
  destroy (): Promise<void>
}