import { EC2, Route53 } from 'aws-sdk';
const ec2 = new EC2();
const route53 = new Route53();

exports.handler = function (event: { [x: string]: { [x: string]: any; }; }, context: { logStreamName: any; }) {
    const hostedZoneId = process.env.hostedZoneId;
    const recordName = process.env.recordName;

    const ec2Params = {
        InstanceIds: [
            event['detail']['EC2InstanceId']
        ]
    };

    ec2.describeInstances(ec2Params, function (err, data) {
        if (err) {
            console.error(err.stack);
        }

        const ip = data.Reservations?.[0].Instances?.[0].PublicIpAddress;

        if (hostedZoneId && recordName && ip) {
            const dnsParams = {
                ChangeBatch: {
                    Changes: [{
                        Action: 'UPSERT',
                        ResourceRecordSet: {
                            Name: recordName,
                            ResourceRecords: [{
                                Value: ip
                            }],
                            TTL: 60,
                            Type: 'A'
                        }
                    }],
                    Comment: "Updating"
                },
                HostedZoneId: hostedZoneId
            }
            route53.changeResourceRecordSets(dnsParams, function (err, data) {
                if (err) {
                    console.log(err, err.stack);
                } else {
                    console.log(data);
                }
            });
        } else {
            console.error("Missing a parameter");
        }
    });
    return context.logStreamName;
}
