const needle = require('needle'),
  cryptojs = require('crypto-js'),
  md5 = require('crypto-js/md5'),
  fs = require('fs');

const args = {
  developer_id: process.env.FS_DEVELOPER_ID,
  plugin_id: process.env.FS_PLUGIN_ID,
  public_key: process.env.FS_PUBLIC_KEY,
  secret_key: process.env.FS_SECRET_KEY,
};

function deploy(zip_path, zip_name, add_contributor = true) {
  validate();

  return request(
    'POST', '/v1/developers/' + args.developer_id + '/plugins/' + args.plugin_id + '/tags.json',
    {
      add_contributor,
      file: {
        buffer: fs.readFileSync(zip_path + zip_name),
        filename: zip_name,
        content_type: 'application/zip',
      }
    },
    {
      multipart: true,
      boundary: '----' + (new Date().getTime()).toString(16),
    }
  )
    .then(response => {
      if (responseError(response)) {
        return;
      }

      let body = response.body;
      console.log('\x1b[32m%s\x1b[0m', 'Successfully deployed version ' + body.version + ' to Freemius.');
      console.log(body);

      return body;
    })
    .catch(responseCatch);
}

function release(tag) {
  return request(
    'PUT', `/v1/developers/${args.developer_id}/plugins/${args.plugin_id}/tags/${tag.id}.json`,
    { release_mode: 'released' },
    { json: true }
  )
    .then(response => {
      if (responseError(response)) {
        return;
      }

      let body = response.body;
      if (body.id) {
        console.log('\x1b[32m%s\x1b[0m', 'Successfully released version ' + body.version + ' to Freemius.');
        console.log(body);
        return body;
      }

      console.log('\x1b[31m%s\x1b[0m', 'Error releasing to Freemius.');
      process.exit(1);
    })
    .catch(responseCatch);
}

function validate() {
  console.log(args);

  for (let argKey in args) {
    if (args[argKey] === undefined) {
      console.log('\x1b[31m%s\x1b[0m', argKey + ' is not defined');
      process.exit(1);
    }
  }
}

function sign(method, contentMd5, contentType, date, url) {
  let string_to_sign = [
      method.toUpperCase(),
      contentMd5,
      contentType,
      date,
      url
    ].join("\n"),
    hash = cryptojs.HmacSHA256(string_to_sign, args.secret_key),
    str = (new Buffer(hash.toString()).toString('base64'))
      .replace(/=/g, '');

  return 'FS ' + args.developer_id + ':' + args.public_key + ':' + str;
}

function request(method, url, data = null, options = {}) {
  let date = new Date().toUTCString(),
    contentMd5 = '',
    contentType = '';

  if (options.multipart) {
    contentType = 'multipart/form-data; boundary=' + options.boundary;
  } else if (options.json) {
    contentType = 'application/json';
    contentMd5 = md5(JSON.stringify(data))
  }

  options = {
    ...options,
    headers: {
      "Content-MD5": contentMd5,
      "Date": date,
      "Authorization": sign(method, contentMd5, contentType, date, url)
    }
  };

  method = method.toLowerCase()
  if (['get', 'head'].indexOf(method) > -1) {
    return needle(method, 'https://api.freemius.com' + url, options)
  }
  else {
    return needle(method, 'https://api.freemius.com' + url, data, options)
  }
}

function responseCatch(error) {
  console.log('\x1b[31m%s\x1b[0m', 'Error in Freemius response.');
  console.error(error);
  process.exit(1);
}

function responseError(response) {
  if (typeof response.body !== 'object') {
    console.log('\x1b[33m%s\x1b[0m', 'Try deploying to Freemius again in a minute.');
    process.exit(1);
  }

  if (typeof response.body.error !== 'undefined') {
    console.log('\x1b[31m%s\x1b[0m', 'Error: ' + response.body.error.message);
    console.error(response.body);
    process.exit(1);
  }

  return false;
}

module.exports = {
  deploy,
  release,
  request,
};
