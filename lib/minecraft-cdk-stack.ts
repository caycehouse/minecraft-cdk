import * as cdk from '@aws-cdk/core';
import * as cfn_inc from '@aws-cdk/cloudformation-include';
import * as ec2 from '@aws-cdk/aws-ec2'
import * as ecs from '@aws-cdk/aws-ecs';
import * as autoscaling from '@aws-cdk/aws-autoscaling';

export class MinecraftCdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'Vpc', {
      cidr: "10.100.0.0/26",
      enableDnsSupport: true,
      enableDnsHostnames: true
    })

    // Create an ECS cluster
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
    });

    const autoScalingGroup = new autoscaling.AutoScalingGroup(this, 'ASG', {
      vpc,
      instanceType: new ec2.InstanceType('t3.medium'),
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      desiredCapacity: 1,
      spotPrice: '0.015'
    });
    
    const capacityProvider = new ecs.AsgCapacityProvider(this, 'AsgCapacityProvider', {
      autoScalingGroup,
    });
    cluster.addAsgCapacityProvider(capacityProvider);

    const taskDefinition = new ecs.Ec2TaskDefinition(this, 'TaskDef');

    taskDefinition.addContainer('minecraft', {
      image: ecs.ContainerImage.fromRegistry('itzg/minecraft-server:latest'),
      memoryReservationMiB: 1024
    });
    
    new ecs.Ec2Service(this, 'EC2Service', {
      cluster,
      taskDefinition,
      capacityProviderStrategies: [
        {
          capacityProvider: capacityProvider.capacityProviderName,
          weight: 1,
        }
      ],
    });

    //new cfn_inc.CfnInclude(this, 'Template', {
    //  templateFile: 'cf.yml',
    //});
  }
}
