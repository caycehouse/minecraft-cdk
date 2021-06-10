import { AutoScaling } from 'aws-sdk';
const autoscaling = new AutoScaling();

exports.handler = function (event: { [x: string]: string; }, context: { logStreamName: any; }) {
    const autoScalingGroup = process.env.autoScalingGroup;
    const capacity = event['status'] === "Running" ? 1 : 0;

    if (autoScalingGroup !== undefined) {
        var params = {
            AutoScalingGroupName: autoScalingGroup,
            DesiredCapacity: capacity,
            MaxSize: capacity, 
            MinSize: capacity
        };
        autoscaling.updateAutoScalingGroup(params, function (err, data) {
            if (err) {
                console.log(err, err.stack);
            } else {
                console.log(data);
            }
        });
    }

    return context.logStreamName;
}
