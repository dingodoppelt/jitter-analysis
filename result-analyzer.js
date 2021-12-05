const path = require('path')
const glob = require('glob')
const fs = require('fs')

const resultFiles = glob.sync(`${process.argv[2]}*.log`)
const args = Object.fromEntries(resultFiles.map(k => [path.basename(k, '.log'), undefined]));

const results = Object.fromEntries(Object.keys(args).map(pinger => {
    return [pinger, Object.fromEntries(Object.keys(args).map(remote => {
        return [remote, {
            received: 0,
            jitter: 0,
            lost: 0,
            sumPing: 0,
            sumSquaredPing: 0,
            sumSquaredPenalty: 0,
        }]
    }))]
}))

for (const resultFile of resultFiles) {
    const pingerName = path.basename(resultFile, '.log')
    const logEntries = fs.readFileSync(resultFile, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
    
    if (!results[pingerName]) continue
        
        for (const logEntry of logEntries) {
            for (const [remoteName, {received, lost}] of Object.entries(logEntry)) {
                // `received` is an object where the keys are ping times in milliseconds
                // and the values are the number of packets with that ping time.
                if (!results[pingerName][remoteName]) continue
                    
                    let totalPackets = 0
                    let jitter = 0
                    let sumSquaredPing = 0
                    let sumPing = 0
                    let sumSquaredPenalty = 0
                    for (const [pingTimeStr, count] of Object.entries(received)) {
                        const pingTime = +pingTimeStr
                        totalPackets += count
                        sumPing += pingTime * count
                        sumSquaredPing += pingTime * pingTime * count
                    }
                    
                    const meanPing = sumPing / totalPackets
                    for (const [pingTimeStr, count] of Object.entries(received)) {
                        const pingTime = +pingTimeStr
                        const highThreshold = meanPing + 3
                        const lowThreshold = meanPing - 3
                        if (pingTime > highThreshold || pingTime < lowThreshold) {
                            jitter += count
                            const penalty = pingTime - highThreshold
                            sumSquaredPenalty += penalty * penalty * count
                        }
                    }
                    
                    results[pingerName][remoteName].received += totalPackets
                    results[pingerName][remoteName].lost += lost
                    results[pingerName][remoteName].jitter += jitter
                    results[pingerName][remoteName].sumPing += sumPing
                    results[pingerName][remoteName].sumSquaredPing += sumSquaredPing
                    results[pingerName][remoteName].sumSquaredPenalty += sumSquaredPenalty
            }
        }
}

const printTable = (header, description, fn) => {
    console.log('###', description, '###')
    console.log([header.padEnd(10), ...Object.keys(args)].join('\t'))
    for (const [receiver, senders] of Object.entries(results)) {
        console.log([receiver.padEnd(10), ...Object.keys(args).map(senderKey => {
            const sender = senders[senderKey]
            return fn(sender).toString().padEnd(18)
        })].join('\t'))
    }
    console.log()
}

printTable('RMS', 'Root-mean-squared of delays above mean ping + 3ms (ms, lower is better)', (data) => {
    return Math.sqrt(data.sumSquaredPenalty / data.received)
})

printTable('Jitter', 'Number of packets above mean ping + 3ms (lower is better)', (data) => {
    return data.jitter
})

printTable('Jitter', 'Percentage of packets above mean ping + 3ms (lower is better)', (data) => {
    return data.jitter / data.received
})

printTable('Lost', 'Numbers of packets lost (no response in 1000ms, lower is better)', (data) => {
    return data.lost
})

printTable('Received', 'Number of packets received (higher is better)', (data) => {
    return data.received
})

printTable('Mean Ping', 'Average ping value (ms, lower is better)', (data) => {
    return data.sumPing / data.received
})
