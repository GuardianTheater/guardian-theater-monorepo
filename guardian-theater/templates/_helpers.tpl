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

{{- define "guardian-theater.xbox-account-matcher.fullname" -}}
{{- printf "xbox-account-matcher" -}}
{{- end -}}

{{- define "guardian-theater.destiny-to-bungie-profile-linker.fullname" -}}
{{- printf "destiny-to-bungie-profile-linker" -}}
{{- end -}}

{{- define "guardian-theater.mixer-name-matcher.fullname" -}}
{{- printf "mixer-name-matcher" -}}
{{- end -}}

{{- define "guardian-theater.mixer-recording-fetcher.fullname" -}}
{{- printf "mixer-recording-fetcher" -}}
{{- end -}}

{{- define "guardian-theater.twitch-name-matcher.fullname" -}}
{{- printf "twitch-name-matcher" -}}
{{- end -}}

{{- define "guardian-theater.twitch-vod-fetcher.fullname" -}}
{{- printf "twitch-vod-fetcher" -}}
{{- end -}}

{{- define "guardian-theater.xbox-clip-fetcher.fullname" -}}
{{- printf "xbox-clip-fetcher" -}}
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
Common labels - xbox-account-matcher
*/}}
{{- define "guardian-theater.xbox-account-matcher.labels" -}}
helm.sh/chart: {{ include "guardian-theater.chart" . }}
{{ include "guardian-theater.xbox-account-matcher.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Common labels - destiny-to-bungie-profile-linker
*/}}
{{- define "guardian-theater.destiny-to-bungie-profile-linker.labels" -}}
helm.sh/chart: {{ include "guardian-theater.chart" . }}
{{ include "guardian-theater.destiny-to-bungie-profile-linker.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Common labels - mixer-name-matcher
*/}}
{{- define "guardian-theater.mixer-name-matcher.labels" -}}
helm.sh/chart: {{ include "guardian-theater.chart" . }}
{{ include "guardian-theater.mixer-name-matcher.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Common labels - mixer-recording-fetcher
*/}}
{{- define "guardian-theater.mixer-recording-fetcher.labels" -}}
helm.sh/chart: {{ include "guardian-theater.chart" . }}
{{ include "guardian-theater.mixer-recording-fetcher.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Common labels - twitch-name-matcher
*/}}
{{- define "guardian-theater.twitch-name-matcher.labels" -}}
helm.sh/chart: {{ include "guardian-theater.chart" . }}
{{ include "guardian-theater.twitch-name-matcher.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Common labels - twitch-vod-fetcher
*/}}
{{- define "guardian-theater.twitch-vod-fetcher.labels" -}}
helm.sh/chart: {{ include "guardian-theater.chart" . }}
{{ include "guardian-theater.twitch-vod-fetcher.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Common labels - xbox-clip-fetcher
*/}}
{{- define "guardian-theater.xbox-clip-fetcher.labels" -}}
helm.sh/chart: {{ include "guardian-theater.chart" . }}
{{ include "guardian-theater.xbox-clip-fetcher.selectorLabels" . }}
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
Selector labels - xbox-account-matcher
*/}}
{{- define "guardian-theater.xbox-account-matcher.selectorLabels" -}}
app.kubernetes.io/name: xbox-account-matcher
app.kubernetes.io/instance: xbox-account-matcher
app.kubernetes.io/app: guardian-theater
{{- end -}}

{{/*
Selector labels - destiny-to-bungie-profile-linker
*/}}
{{- define "guardian-theater.destiny-to-bungie-profile-linker.selectorLabels" -}}
app.kubernetes.io/name: destiny-to-bungie-profile-linker
app.kubernetes.io/instance: destiny-to-bungie-profile-linker
app.kubernetes.io/app: guardian-theater
{{- end -}}

{{/*
Selector labels - mixer-name-matcher
*/}}
{{- define "guardian-theater.mixer-name-matcher.selectorLabels" -}}
app.kubernetes.io/name: mixer-name-matcher
app.kubernetes.io/instance: mixer-name-matcher
app.kubernetes.io/app: guardian-theater
{{- end -}}

{{/*
Selector labels - mixer-recording-fetcher
*/}}
{{- define "guardian-theater.mixer-recording-fetcher.selectorLabels" -}}
app.kubernetes.io/name: mixer-recording-fetcher
app.kubernetes.io/instance: mixer-recording-fetcher
app.kubernetes.io/app: guardian-theater
{{- end -}}

{{/*
Selector labels - twitch-name-matcher
*/}}
{{- define "guardian-theater.twitch-name-matcher.selectorLabels" -}}
app.kubernetes.io/name: twitch-name-matcher
app.kubernetes.io/instance: twitch-name-matcher
app.kubernetes.io/app: guardian-theater
{{- end -}}

{{/*
Selector labels - twitch-vod-fetcher
*/}}
{{- define "guardian-theater.twitch-vod-fetcher.selectorLabels" -}}
app.kubernetes.io/name: twitch-vod-fetcher
app.kubernetes.io/instance: twitch-vod-fetcher
app.kubernetes.io/app: guardian-theater
{{- end -}}

{{/*
Selector labels - xbox-clip-fetcher
*/}}
{{- define "guardian-theater.xbox-clip-fetcher.selectorLabels" -}}
app.kubernetes.io/name: xbox-clip-fetcher
app.kubernetes.io/instance: xbox-clip-fetcher
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
