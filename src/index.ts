import { fetch } from 'undici'
import * as ethers from 'ethers'
import Safe from '@safe-global/protocol-kit'
import SafeApiKit from '@safe-global/api-kit'
import { MetaTransactionData } from '@safe-global/safe-core-sdk-types'
import 'dotenv/config'
import abi from './abi'

const contract = new ethers.Contract('0xFEC09d5C192aaf7Ec7E2C89Cc8D3224138391B2E', abi)

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC!)
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider)
  const safeService = new SafeApiKit({ chainId: BigInt(137) })

  const safe = await Safe.init({
    provider: process.env.RPC!,
    signer: process.env.PRIVATE_KEY!,
    safeAddress: process.env.SAFE_ADDRESS!
  })
  console.log('Get POIs')

  const pendingPOIs = await getPendingPOIs()
  console.log(pendingPOIs)

  const safeTransactionData: MetaTransactionData[] = await Promise.all(
    pendingPOIs.map(async (a) => await poiTransactionData(a.action, a.coordinates))
  )
  console.log(safeTransactionData)

  const nonce = await safeService.getNextNonce(process.env.SAFE_ADDRESS!)
  if (Number.isNaN(+nonce)) {
    console.log(nonce)
    return
  }

  const safeTransaction = await safe.createTransaction({
    transactions: safeTransactionData,
    options: { nonce: 135/*+nonce*/ },
    onlyCalls: true
  })
  const safeTxHash = await safe.getTransactionHash(safeTransaction)
  const senderSignature = await safe.signHash(safeTxHash)
  await safeService.proposeTransaction({
    safeAddress: process.env.SAFE_ADDRESS!,
    safeTransactionData: safeTransaction.data,
    safeTxHash,
    senderAddress: signer.address,
    senderSignature: senderSignature.data
  })
}

void main()

async function poiTransactionData(action: 'add_poi' | 'remove_poi', coordinates: string): Promise<MetaTransactionData> {
  console.log(action, coordinates)

  let tx = { data: '', to: '' }
  if (action === 'add_poi') tx = await (contract as any)['add'].populateTransaction(coordinates)
  if (action === 'remove_poi') tx = await (contract as any)['remove'].populateTransaction(coordinates)

  const data: MetaTransactionData = { data: tx.data, to: tx.to, value: '0' }
  return data
}

async function getPendingPOIs(): Promise<pendingPOIs[]> {
  const res = await fetch('https://governance.decentraland.org/api/proposals?limit=25&offset=0&status=passed&type=poi')
  const json = (await res.json()) as GovernanceResponse
  return json.data.map((a) => {
    return { action: a.configuration.type, coordinates: `${a.configuration.x},${a.configuration.y}` }
  })
}

interface pendingPOIs {
  action: 'add_poi' | 'remove_poi'
  coordinates: string
}

interface GovernanceResponse {
  ok: boolean
  total: number
  data: GovernanceData[]
}

interface GovernanceData {
  id: string
  user: string
  type: string
  status: string
  configuration: Configuration
  enacted: boolean
  deleted: boolean
  start_at: Date
  finish_at: Date
}

interface Configuration {
  x: number
  y: number
  type: 'add_poi' | 'remove_poi'
  choices: string[]
  description: string
}
