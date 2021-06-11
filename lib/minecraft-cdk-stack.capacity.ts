import { AutoScaling, ECS } from 'aws-sdk';
const autoscaling = new AutoScaling();
const ecs = new ECS();

exports.handler = function (event: { [x: string]: string; }, context: { logStreamName: any; }) {
    const autoScalingGroup = process.env.autoScalingGroup;
    const service = process.env.service;
    const capacity = event['status'] === "Running" ? 1 : 0;

    if (autoScalingGroup !== undefined && service !== undefined) {
        var ecsParams = {
            desiredCount: capacity, 
            service: service
           };
           ecs.updateService(ecsParams, function(err, data) {
            if (err) {
                console.log(err, err.stack);
            } else {
                console.log(data);
            }
           });

        var asgParams = {
            AutoScalingGroupName: autoScalingGroup,
            DesiredCapacity: capacity,
            MaxSize: capacity, 
            MinSize: capacity
        };
        autoscaling.updateAutoScalingGroup(asgParams, function (err, data) {
            if (err) {
                console.log(err, err.stack);
            } else {
                console.log(data);
            }
        });
    }

    return context.logStreamName;
}
