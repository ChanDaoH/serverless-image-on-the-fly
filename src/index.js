const fs = require('fs');
const oss = require('ali-oss');
const im = require('imagemagick');

const ERROR_REQUEST_FORMAT = 'Error request format';
const ERROR_OSS_CONFIG = 'Please config OSS_REGION and OSS_BUCKET_NAME in .env file';

module.exports.handler = async function(req, resp, context) {
    // validate request params, path format: /width * height/imageName
    const arr = req.path.split('/').filter(value => value);
    if (arr.length !== 2) {
        sendErrMsg(resp, ERROR_REQUEST_FORMAT);
        return;
    }
    const spec = arr[0];
    const fileName = arr[1];
    if (!/[0-9]+\*[0-9]+/.test(spec)) {
        sendErrMsg(resp, ERROR_REQUEST_FORMAT);
        return;
    }
    // generate oss client
    if (!process.env.OSS_REGION || !process.env.OSS_BUCKET_NAME) {
        sendErrMsg(resp, ERROR_OSS_CONFIG);
        return;
    }
    const ossRegion = process.env.OSS_REGION;
    const ossBucket = process.env.OSS_BUCKET_NAME;
    const ossClient = new oss({
        region: ossRegion,
        bucket: ossBucket,
        accessKeyId: context.credentials.accessKeyId,
        accessKeySecret: context.credentials.accessKeySecret,
        stsToken: context.credentials.securityToken,
    });
    // get src file
    let getResult;
    try {
        getResult = await ossClient.get(fileName);
    } catch (ex) {
        sendErrMsg(resp, `Fail to get ${fileName}`);
        return;
    }
    const width = spec.split('*')[0];
    const height = spec.split('*')[1];
    const resizedFilePath = `/tmp/dst_${Math.random().toString(36).substring(2, 15)}.jpg`;

    // resize image、put result to OSS bucket、redirect client to result url
    try {
        await (new Promise((resolve, reject) => {
            im.crop({
                srcData: getResult.content,
                dstPath: resizedFilePath,
                width,
                height,
                gravity: 'Center',
            }, (err) => {
                if (err) {
                    reject(err);
                }
                resolve();
            });
        }));
        await ossClient.put(req.path.slice(1), fs.readFileSync(resizedFilePath));
        sendRedirectUrl(resp, `https://${ossBucket}.${ossRegion}.aliyuncs.com${req.path}`);
    } catch (ex) {
        sendErrMsg(resp, ex.message);
        return;
    }
}

const sendErrMsg = (resp, err) => {
    resp.setHeader('content-type', 'text/plain');
    resp.send(err);
}

const sendRedirectUrl = (resp, url) => {
    resp.setStatusCode(302);
    resp.setHeader('location', url);
    resp.send();
}