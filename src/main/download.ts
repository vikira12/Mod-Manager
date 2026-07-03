import fs from 'fs'
import axios from 'axios'

// 임시 파일에 받은 뒤 교체해서, 실패해도 반쯤 받다 만 파일이 남지 않게 한다
export async function downloadFile(url: string, dest: string): Promise<void> {
  const tmp = `${dest}.download`
  const writer = fs.createWriteStream(tmp)
  try {
    const resp = await axios({ url, method: 'GET', responseType: 'stream' })
    await new Promise<void>((res, rej) => {
      resp.data.pipe(writer)
      writer.on('finish', res)
      writer.on('error', rej)
      resp.data.on('error', rej)
    })
    fs.renameSync(tmp, dest)
  } catch (err) {
    writer.destroy()
    fs.rmSync(tmp, { force: true })
    throw err
  }
}
