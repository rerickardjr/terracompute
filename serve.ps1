# ==========================================
# TerraCompute Dashboard HTTP Server
# Portable PowerShell web server for local development
# ==========================================

param(
    [int]$port = 8000,
    [string]$basePath = (Split-Path -Parent $MyInvocation.MyCommand.Path)
)

Write-Host "TerraCompute HTTP Server" -ForegroundColor Cyan
Write-Host "Base Path: $basePath"
Write-Host "Port: $port"
Write-Host ""

if (-not (Test-Path $basePath)) {
    Write-Error "Base path does not exist: $basePath"
    exit 1
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

try {
    $listener.Start()
    Write-Host "PowerShell HTTP Server running on http://localhost:$port/" -ForegroundColor Green
    Write-Host "Press Ctrl+C to stop"
    Write-Host ""
    
    while ($listener.IsListening) {
        try {
            $context = $listener.GetContext()
            $request = $context.Request
            $response = $context.Response
            
            # Log request
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] GET $($request.Url.LocalPath)" -ForegroundColor Cyan
            
            $rawPath = $request.Url.LocalPath
            if ($rawPath -eq "/") { 
                $rawPath = "/dashboard/index.html" 
            }
            
            # Clean up path separators and prevent directory traversal
            $relPath = $rawPath.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
            
            # Prevent directory traversal attacks
            if ($relPath.Contains('..')) {
                $response.StatusCode = 403
                $bytes = [System.Text.Encoding]::UTF8.GetBytes("403 Forbidden: Invalid path")
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                $response.OutputStream.Close()
                Write-Host "  -> 403 Forbidden (path traversal attempt)" -ForegroundColor Yellow
                continue
            }
            
            $filePath = Join-Path $basePath $relPath
            
            # Verify file is within basePath (security check)
            $resolvedFilePath = [System.IO.Path]::GetFullPath($filePath)
            $resolvedBasePath = [System.IO.Path]::GetFullPath($basePath)
            
            if (-not $resolvedFilePath.StartsWith($resolvedBasePath)) {
                $response.StatusCode = 403
                $bytes = [System.Text.Encoding]::UTF8.GetBytes("403 Forbidden: Path outside base directory")
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                $response.OutputStream.Close()
                Write-Host "  -> 403 Forbidden (outside base path)" -ForegroundColor Yellow
                continue
            }
            
            if (Test-Path $filePath -PathType Leaf) {
                try {
                    $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                    $contentType = "application/octet-stream"
                    
                    # Map file extensions to content types
                    $contentTypeMap = @{
                        ".html" = "text/html; charset=utf-8"
                        ".css"  = "text/css; charset=utf-8"
                        ".js"   = "application/javascript; charset=utf-8"
                        ".json" = "application/json; charset=utf-8"
                        ".png"  = "image/png"
                        ".jpg"  = "image/jpeg"
                        ".jpeg" = "image/jpeg"
                        ".gif"  = "image/gif"
                        ".svg"  = "image/svg+xml"
                        ".ico"  = "image/x-icon"
                        ".txt"  = "text/plain; charset=utf-8"
                    }
                    
                    if ($contentTypeMap.ContainsKey($ext)) {
                        $contentType = $contentTypeMap[$ext]
                    }
                    
                    $response.ContentType = $contentType
                    $bytes = [System.IO.File]::ReadAllBytes($filePath)
                    $response.ContentLength64 = $bytes.Length
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    
                    Write-Host "  -> 200 OK ($([Math]::Round($bytes.Length / 1KB, 2)) KB)" -ForegroundColor Green
                } catch {
                    $response.StatusCode = 500
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes("500 Internal Server Error: Failed to read file")
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    Write-Host "  -> 500 Error: $_" -ForegroundColor Red
                }
            } else {
                $response.StatusCode = 404
                $bytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $rawPath")
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                Write-Host "  -> 404 Not Found" -ForegroundColor Yellow
            }
            
            $response.OutputStream.Close()
        } catch {
            Write-Error "Request handling error: $_"
        }
    }
} catch {
    Write-Error $_
} finally {
    if ($listener) {
        $listener.Stop()
        $listener.Dispose()
        Write-Host "Server stopped"
    }
}
