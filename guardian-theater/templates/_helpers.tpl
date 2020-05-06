{{/* vim: set filetype=mustache: */}}
{{/*
Expand the name of the chart.
*/}}
{{- define "guardian-theater.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}



{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "guardian-theater.fullname" -}}
{{- printf "guardian-theater" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "guardian-theater.activity-harvester.fullname" -}}
{{- printf "activity-harvester" -}}
{{- end -}}

{{- define "guardian-theater.activity-harvester.fullname" -}}
{{- printf "account-harvester" -}}
{{- end -}}

{{- define "guardian-theater.activity-harvester.fullname" -}}
{{- printf "video-harvester" -}}
{{- end -}}





{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "guardian-theater.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}





{{/*
Common labels - guardian-theater
*/}}
{{- define "guardian-theater.labels" -}}
helm.sh/chart: {{ include "guardian-theater.chart" . }}
{{ include "guardian-theater.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}


{{/*
Common labels - activity-harvester
*/}}
{{- define "guardian-theater.activity-harvester.labels" -}}
helm.sh/chart: {{ include "guardian-theater.chart" . }}
{{ include "guardian-theater.activity-harvester.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Common labels - account-harvester
*/}}
{{- define "guardian-theater.account-harvester.labels" -}}
helm.sh/chart: {{ include "guardian-theater.chart" . }}
{{ include "guardian-theater.account-harvester.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Common labels - video-harvester
*/}}
{{- define "guardian-theater.video-harvester.labels" -}}
helm.sh/chart: {{ include "guardian-theater.chart" . }}
{{ include "guardian-theater.video-harvester.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}






{{/*
Selector labels - guardian-theater
*/}}
{{- define "guardian-theater.selectorLabels" -}}
app.kubernetes.io/name: guardian-theater
app.kubernetes.io/instance: guardian-theater
app.kubernetes.io/app: guardian-theater
{{- end -}}

{{/*
Selector labels - activity-harvester
*/}}
{{- define "guardian-theater.activity-harvester.selectorLabels" -}}
app.kubernetes.io/name: activity-harvester
app.kubernetes.io/instance: activity-harvester
app.kubernetes.io/app: guardian-theater
{{- end -}}

{{/*
Selector labels - account-harvester
*/}}
{{- define "guardian-theater.account-harvester.selectorLabels" -}}
app.kubernetes.io/name: account-harvester
app.kubernetes.io/instance: account-harvester
app.kubernetes.io/app: guardian-theater
{{- end -}}

{{/*
Selector labels - video-harvester
*/}}
{{- define "guardian-theater.video-harvester.selectorLabels" -}}
app.kubernetes.io/name: video-harvester
app.kubernetes.io/instance: video-harvester
app.kubernetes.io/app: guardian-theater
{{- end -}}




{{/*
Create the name of the service account to use
*/}}
{{- define "guardian-theater.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
    {{ default (include "guardian-theater.fullname" .) .Values.serviceAccount.name }}
{{- else -}}
    {{ default "default" .Values.serviceAccount.name }}
{{- end -}}
{{- end -}}
