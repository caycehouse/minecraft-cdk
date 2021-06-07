import * as autoscaling from '@aws-cdk/aws-autoscaling';
import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2'
import * as ecs from '@aws-cdk/aws-ecs';
import * as efs from '@aws-cdk/aws-efs';

export class MinecraftCdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

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
      instanceType: new ec2.InstanceType(this.node.tryGetContext('instanceType')),
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      spotPrice: this.node.tryGetContext('spotPrice'),
      associatePublicIpAddress: true,
      desiredCapacity: this.node.tryGetContext('serverState') === "Running" ? 1 : 0,
      minCapacity: this.node.tryGetContext('serverState') === "Running" ? 1 : 0,
      maxCapacity: this.node.tryGetContext('serverState') === "Running" ? 1 : 0,
      keyName: this.node.tryGetContext('keyPairName'),
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
      image: ecs.ContainerImage.fromRegistry(`itzg/minecraft-server:${this.node.tryGetContext('minecraftImageTag')}`),
      memoryReservationMiB: 1024,
      environment: {
        'EULA': "TRUE",
        'TYPE': this.node.tryGetContext('minecraftTypeTag'),
        'OPS': this.node.tryGetContext('adminPlayerNames'),
        'DIFFICULTY': this.node.tryGetContext('difficulty'),
        'WHITELIST': this.node.tryGetContext('whitelist'),
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

    // Allow Minecraft connections
    autoScalingGroup.connections.allowFromAnyIpv4(ec2.Port.tcp(25565));

    // Allow ssh if your ipv4 address was provided
    if (!this.node.tryGetContext('yourIPv4').valueAsString) {
      service.connections.allowFrom(
        ec2.Peer.ipv4(`${this.node.tryGetContext('yourIPv4').valueAsString}/32`),
        ec2.Port.tcp(22)
      );
    }

    // Output how to find the instance ip
    new cdk.CfnOutput(this, "CheckInstanceIp", {
      value: `https://${service.env.region}.console.aws.amazon.com/ec2/v2/home?region=${service.env.region}#Instances:tag:aws:autoscaling:groupName=${autoScalingGroup.autoScalingGroupName};sort=tag:Name`,
      description: "To find your Minecraft instance IP address, visit the following link. Click on the instance to find its Public IP address."
    });
  }
}
