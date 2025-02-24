import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';

const X509 = "x509";

// verify target artifact with Notation
async function verify() {
    try {
        const target_artifact_ref = core.getInput('target_artifact_reference');
        const trust_policy = core.getInput('trust_policy'); // .github/trustpolicy/trustpolicy.json
        const trust_store = core.getInput('trust_store'); // .github/truststore
        // configure Notation trust policys
        await exec.getExecOutput('notation', ['policy', 'import', trust_policy]);
        await exec.getExecOutput('notation', ['policy', 'show']);
        // configure Notation trust store
        await configTrustStore(trust_store);
        await exec.getExecOutput('notation', ['cert', 'ls']);
        // verify core logic
        if (process.env.NOTATION_EXPERIMENTAL) {
            await exec.getExecOutput('notation', ['verify', '--allow-referrers-api', target_artifact_ref, '-v']);
        } else {
            await exec.getExecOutput('notation', ['verify', target_artifact_ref, '-v']);
        }
    } catch (e: unknown) {
        if (e instanceof Error) {
            core.setFailed(e);
        } else {
            core.setFailed('Unknown error');
        }
    }
}

// configTrustStore configures Notation trust store based on specs.
// Reference: https://github.com/notaryproject/notaryproject/blob/main/specs/trust-store-trust-policy.md#trust-store
async function configTrustStore(dir: string) {
    let trustStoreX509 = path.join(dir, X509); // .github/truststore/x509
    if (!fs.existsSync(trustStoreX509)) {
        throw new Error("cannot find dir: <trust_store>/x509");
    }
    let trustStoreTypes = getSubdir(trustStoreX509); // [.github/truststore/x509/ca, .github/truststore/x509/signingAuthority, ...]
    for (let i = 0; i < trustStoreTypes.length; ++i) {
        let trustStoreType = path.basename(trustStoreTypes[i]);
        let trustStores = getSubdir(trustStoreTypes[i]); // [.github/truststore/x509/ca/<my_store1>, .github/truststore/x509/ca/<my_store2>, ...]
        for (let j = 0; j < trustStores.length; ++j) {
            let trustStore = trustStores[j]; // .github/truststore/x509/ca/<my_store>
            let trustStoreName = path.basename(trustStore); // <my_store>
            let certFile = getFileFromDir(trustStore); // [.github/truststore/x509/ca/<my_store>/<my_cert1>, .github/truststore/x509/ca/<my_store>/<my_cert2>, ...]
            exec.getExecOutput('notation', ['cert', 'add', '-t', trustStoreType, '-s', trustStoreName, ...certFile]);
        }
    }
}

// getSubdir gets all sub dirs under dir without recursive
function getSubdir(dir: string): string[] {
    return fs.readdirSync(dir, {withFileTypes: true, recursive: false})
            .filter(item => item.isDirectory())
            .map(item => path.join(dir, item.name));
}

// getSubdir gets all files under dir without recursive
function getFileFromDir(dir: string): string[] {
    return fs.readdirSync(dir, {withFileTypes: true, recursive: false})
            .filter(item => !item.isDirectory())
            .map(item => path.join(dir, item.name));
}

export = verify;

if (require.main === module) {
    verify();
}