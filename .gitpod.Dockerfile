FROM gitpod/workspace-full

RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" && \
    unzip awscliv2.zip && \
    sudo ./aws/install && \
    rm -r aws && \
    rm awscliv2.zip && \
    npm install -g aws-cdk
