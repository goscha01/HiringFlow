FROM public.ecr.aws/lambda/nodejs:20-arm64

# Install static ffmpeg + ffprobe (arm64 build from John Van Sickle, the
# canonical Linux static builds — single binary per tool, no dynamic deps).
RUN microdnf install -y tar xz && microdnf clean all \
 && curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz -o /tmp/ffmpeg.tar.xz \
 && tar -xJf /tmp/ffmpeg.tar.xz -C /tmp \
 && mv /tmp/ffmpeg-*-arm64-static/ffmpeg /usr/local/bin/ffmpeg \
 && mv /tmp/ffmpeg-*-arm64-static/ffprobe /usr/local/bin/ffprobe \
 && chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe \
 && rm -rf /tmp/ffmpeg.tar.xz /tmp/ffmpeg-*-arm64-static

WORKDIR ${LAMBDA_TASK_ROOT}
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY index.mjs ./

CMD ["index.handler"]
