import * as autoscaling from '@aws-cdk/aws-autoscaling';
import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2'
import * as ecs from '@aws-cdk/aws-ecs';
import * as efs from '@aws-cdk/aws-efs';
import * as events from '@aws-cdk/aws-events';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda-nodejs';
import * as targets from "@aws-cdk/aws-events-targets";

export class MinecraftCdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const adminPlayerNames = this.node.tryGetContext('adminPlayerNames');
    const capacity = this.node.tryGetContext('serverState') === "Running" ? 1 : 0;
    const difficulty = this.node.tryGetContext('difficulty');
    const hostedZoneId = this.node.tryGetContext('hostedZoneId');
    const instanceType = this.node.tryGetContext('instanceType');
    const keyPairName = this.node.tryGetContext('keyPairName');
    const minecraftImageTag = this.node.tryGetContext('minecraftImageTag');
    const minecraftTypeTag = this.node.tryGetContext('minecraftTypeTag');
    const memory = this.node.tryGetContext('memory');
    const recordName = this.node.tryGetContext('recordName');
    const spotPrice = this.node.tryGetContext('spotPrice');
    const whitelist = this.node.tryGetContext('whitelist');
    const yourIPv4 = this.node.tryGetContext('yourIPv4');

    // Create an EC2 Vpc
    const vpc = new ec2.Vpc(this, 'Vpc', {
      subnetConfiguration: [
        {
          name: "minecraftPublicSubnet",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    })

    // Create an ECS Cluster
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
    });

    // Create an Auto Scaling Group
    const autoScalingGroup = new autoscaling.AutoScalingGroup(this, 'ASG', {
      vpc,
      spotPrice,
      instanceType: new ec2.InstanceType(instanceType),
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      associatePublicIpAddress: true,
      desiredCapacity: capacity,
      minCapacity: 0,
      maxCapacity: 1,
      ...(keyPairName !== undefined && { keyName: keyPairName }),
    });

    // Create an Auto Scaling Group Capacity Provider
    const capacityProvider = new ecs.AsgCapacityProvider(this, 'AsgCapacityProvider', {
      autoScalingGroup,
    });
    cluster.addAsgCapacityProvider(capacityProvider);

    // Create an EFS FileSystem
    const fileSystem = new efs.FileSystem(this, 'EfsFileSystem', {
      vpc,
    });

    // Automount the efs filesystem to /opt/minecraft
    autoScalingGroup.addUserData("yum check-update -y",
      "yum upgrade -y",
      "yum install -y amazon-efs-utils",
      "yum install -y nfs-utils",
      "file_system_id_1=" + fileSystem.fileSystemId,
      "efs_mount_point_1=/opt/minecraft",
      "mkdir -p \"${efs_mount_point_1}\"",
      "test -f \"/sbin/mount.efs\" && echo \"${file_system_id_1}:/ ${efs_mount_point_1} efs defaults,_netdev\" >> /etc/fstab || " +
      "echo \"${file_system_id_1}.efs." + cdk.Stack.of(this).region + ".amazonaws.com:/ ${efs_mount_point_1} nfs4 nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport,_netdev 0 0\" >> /etc/fstab",
      "mount -a -t efs,nfs4 defaults");

    // Create an ECS Volume
    const volume: ecs.Volume = {
      name: "minecraft-volume",
      host: {
        sourcePath: "/opt/minecraft"
      }
    };

    // Create an ECS EC2 Task Definition
    const taskDefinition = new ecs.Ec2TaskDefinition(this, 'TaskDef', {
      volumes: [volume]
    });

    // Create the container definition
    const container = taskDefinition.addContainer('minecraft', {
      image: ecs.ContainerImage.fromRegistry(`itzg/minecraft-server:${minecraftImageTag}`),
      memoryReservationMiB: 1024,
      environment: {
        'EULA': "TRUE",
        ...(minecraftTypeTag !== undefined && { 'TYPE': minecraftTypeTag }),
        ...(adminPlayerNames !== undefined && { 'OPS': adminPlayerNames }),
        ...(difficulty !== undefined && { 'DIFFICULTY': difficulty }),
        ...(whitelist !== undefined && { 'WHITELIST': whitelist }),
        ...(memory !== undefined && { 'MEMORY': memory }),
      },
    });

    // Create an ECS MountPoint
    const mountPoint: ecs.MountPoint = {
      containerPath: "/data",
      sourceVolume: volume.name,
      readOnly: false,
    };

    // Add the mount point to the container
    container.addMountPoints(mountPoint);

    // Open ports to the container
    container.addPortMappings(
      {
        containerPort: 25565,
        hostPort: 25565,
        protocol: ecs.Protocol.TCP,
      },
    );

    // Start the EC2 Service
    const service = new ecs.Ec2Service(this, 'EC2Service', {
      cluster,
      taskDefinition,
      daemon: true
    });

    // Allow ec2 instance to access efs
    fileSystem.connections.allowDefaultPortFrom(autoScalingGroup);

    // Allow Minecraft connections
    autoScalingGroup.connections.allowFromAnyIpv4(ec2.Port.tcp(25565));

    // Allow ssh if your ipv4 address was provided
    if (yourIPv4 !== undefined) {
      autoScalingGroup.connections.allowFrom(
        ec2.Peer.ipv4(`${yourIPv4}/32`),
        ec2.Port.tcp(22)
      );
    }

    if (hostedZoneId !== undefined && recordName !== undefined) {
      const dnsHandler = new lambda.NodejsFunction(this, 'dns', {
        description: "Sets Route 53 DNS Record for Minecraft",
        timeout: cdk.Duration.seconds(20),
        environment: {
          hostedZoneId: hostedZoneId,
          recordName: recordName,
        },
        bundling: {
          externalModules: [
            'aws-sdk'
          ]
        },
      });

      const dnsPolicy = new iam.PolicyStatement({
        actions: ['route53:*', 'ec2:DescribeInstance*'],
        resources: ['*'],
      });
  
      dnsHandler.role?.attachInlinePolicy(
        new iam.Policy(this, 'DNSPolicy', {
          statements: [dnsPolicy],
        }),
      );

      new events.Rule(this, 'rule', {
        eventPattern: {
          source: ["aws.autoscaling"],
          detail: { "AutoScalingGroupName" : [autoScalingGroup.autoScalingGroupName] },
          detailType: ["EC2 Instance Launch Successful"],
        },
        targets: [new targets.LambdaFunction(dnsHandler)]
      });
    }

    const capacityHandler = new lambda.NodejsFunction(this, 'capacity', {
      description: "Sets capacity for the Minecraft Server",
      timeout: cdk.Duration.seconds(20),
      environment: {
        autoScalingGroup: autoScalingGroup.autoScalingGroupName,
      },
      bundling: {
        externalModules: [
          'aws-sdk'
        ]
      },
    });

    const capacityPolicy = new iam.PolicyStatement({
      actions: ['autoscaling:SetDesiredCapacity*'],
      resources: ['*'],
    });

    capacityHandler.role?.attachInlinePolicy(
      new iam.Policy(this, 'CapacityPolicy', {
        statements: [capacityPolicy],
      }),
    );

    // Output how to find the instance ip
    new cdk.CfnOutput(this, "CheckInstanceIp", {
      value: `https://${service.env.region}.console.aws.amazon.com/ec2/v2/home?region=${service.env.region}#Instances:tag:aws:autoscaling:groupName=${autoScalingGroup.autoScalingGroupName};sort=tag:Name`,
      description: "To find your Minecraft instance IP address, visit the following link. Click on the instance to find its Public IP address."
    });
  }
}
