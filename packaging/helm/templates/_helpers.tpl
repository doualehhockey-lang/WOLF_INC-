{{/*
packaging/helm/templates/_helpers.tpl — Wolf Engine chart helpers.

Named templates used across all chart templates.
*/}}

{{/*
Expand the name of the chart.
*/}}
{{- define "wolf.name" -}}
{{- default .Chart.Name .Values.global.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
Truncated to 63 chars because Kubernetes name fields are limited to 63 chars.
If fullnameOverride is set, use it directly.
*/}}
{{- define "wolf.fullname" -}}
{{- if .Values.global.fullnameOverride }}
{{- .Values.global.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.global.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Component-scoped fully qualified name.
Usage: include "wolf.componentName" (dict "component" "agent" "root" $)
*/}}
{{- define "wolf.componentName" -}}
{{- printf "%s-%s" (include "wolf.fullname" .root) .component | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create chart label value (chart name + version).
*/}}
{{- define "wolf.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Shared labels applied to every resource.
Usage: include "wolf.labels" (dict "component" "agent" "root" $)
*/}}
{{- define "wolf.labels" -}}
helm.sh/chart: {{ include "wolf.chart" .root }}
{{ include "wolf.selectorLabels" . }}
{{- if .root.Chart.AppVersion }}
app.kubernetes.io/version: {{ .root.Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
{{- with .root.Values.global.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end }}

{{/*
Selector labels — stable subset used in matchLabels (must NOT change after first deploy).
Usage: include "wolf.selectorLabels" (dict "component" "agent" "root" $)
*/}}
{{- define "wolf.selectorLabels" -}}
app.kubernetes.io/name: {{ include "wolf.name" .root }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{/*
Resolve image reference for a component.

Priority:
  1. component.image.tag  (explicit override)
  2. .Chart.AppVersion    (default — tracks the release)

Usage: include "wolf.image" (dict "component" $compCfg "root" $)
*/}}
{{- define "wolf.image" -}}
{{- $registry := .root.Values.global.registry -}}
{{- $repo     := .component.image.repository -}}
{{- $tag      := .component.image.tag | default .root.Chart.AppVersion -}}
{{- printf "%s/%s:%s" $registry $repo $tag }}
{{- end }}

{{/*
Resolve image pull policy for a component.
Component-level overrides global.
*/}}
{{- define "wolf.pullPolicy" -}}
{{- .component.image.pullPolicy | default .root.Values.global.imagePullPolicy }}
{{- end }}

{{/*
Render the env block that injects secrets as env vars.
Iterates over .Values.secrets.keys and creates secretKeyRef entries.
*/}}
{{- define "wolf.secretEnv" -}}
{{- $secretName := .Values.secrets.name -}}
{{- range .Values.secrets.keys }}
- name: {{ . }}
  valueFrom:
    secretKeyRef:
      name: {{ $secretName }}
      key: {{ . }}
      optional: false
{{- end }}
{{- end }}

{{/*
Render OTel sidecar container if observability.otelSidecar.enabled.
*/}}
{{- define "wolf.otelSidecar" -}}
{{- if .Values.observability.otelSidecar.enabled }}
- name: otel-collector
  image: {{ .Values.observability.otelSidecar.image }}
  imagePullPolicy: IfNotPresent
  args:
    - "--config=/conf/otel-config.yaml"
  resources:
    {{- toYaml .Values.observability.otelSidecar.resources | nindent 4 }}
  volumeMounts:
    - name: otel-config
      mountPath: /conf
{{- end }}
{{- end }}

{{/*
Render OTel sidecar volume (ConfigMap mount).
*/}}
{{- define "wolf.otelVolume" -}}
{{- if .Values.observability.otelSidecar.enabled }}
- name: otel-config
  configMap:
    name: {{ .Values.observability.otelSidecar.configMap }}
{{- end }}
{{- end }}

{{/*
Service account name for a component.
Usage: include "wolf.serviceAccountName" (dict "component" "agent" "root" $)
*/}}
{{- define "wolf.serviceAccountName" -}}
{{- printf "%s-sa" (include "wolf.componentName" .) }}
{{- end }}
