const fs = require('node:fs')
const path = require('node:path')

const source = path.resolve(__dirname, '../../PControlW-Phone/unpackage/dist/build/h5')
const destination = path.resolve(__dirname, '../phone-web')
if (fs.existsSync(path.join(source, 'index.html'))) {
  fs.cpSync(source, destination, { recursive: true })
  console.log('已包含手机网页，可通过电脑地址直接打开。')
} else console.log('未找到手机网页构建结果，本次仅提供手机 App 连接。')
