#Requires -RunAsAdministrator
<#
  تنظيف القرص C وترتيبه - آمن
  - يحذف الملفات المؤقتة والكاش فقط، لا يلمس مستنداتك أو صورك.
  - ترتيب مجلد التنزيلات وتعطيل السبات اختياريان ويسألك قبلهما.
  التشغيل: انقر بزر الفأرة الأيمن على run-cleanup.bat > تشغيل كمسؤول
#>

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Get-FreeGB { [math]::Round((Get-PSDrive C).Free / 1GB, 2) }

function Clear-Folder($path) {
    if (Test-Path $path) {
        Get-ChildItem -LiteralPath $path -Force | Remove-Item -Recurse -Force
    }
}

function Ask($question) {
    $a = Read-Host "$question (y/n)"
    return $a -match '^(y|yes|ن|نعم)$'
}

$before = Get-FreeGB
Write-Host "`n=== المساحة الحرة قبل التنظيف: $before GB ===`n" -ForegroundColor Cyan

# 1) الملفات المؤقتة
Write-Host '[1/8] حذف الملفات المؤقتة...' -ForegroundColor Yellow
Clear-Folder $env:TEMP
Clear-Folder "$env:WINDIR\Temp"
Get-ChildItem 'C:\Users' -Directory | ForEach-Object {
    Clear-Folder "$($_.FullName)\AppData\Local\Temp"
}

# 2) كاش تحديثات ويندوز
Write-Host '[2/8] حذف كاش تحديثات ويندوز...' -ForegroundColor Yellow
Stop-Service wuauserv, bits -Force
Clear-Folder "$env:WINDIR\SoftwareDistribution\Download"
Start-Service wuauserv, bits

# 3) ملفات تحسين التسليم (Delivery Optimization)
Write-Host '[3/8] حذف كاش تحسين التسليم...' -ForegroundColor Yellow
Delete-DeliveryOptimizationCache -Force
Clear-Folder "$env:WINDIR\ServiceProfiles\NetworkService\AppData\Local\Microsoft\Windows\DeliveryOptimization\Cache"

# 4) سلة المحذوفات
Write-Host '[4/8] تفريغ سلة المحذوفات...' -ForegroundColor Yellow
Clear-RecycleBin -DriveLetter C -Force

# 5) كاش المصغرات وتقارير الأخطاء
Write-Host '[5/8] حذف كاش المصغرات وتقارير الأخطاء...' -ForegroundColor Yellow
Get-ChildItem "$env:LOCALAPPDATA\Microsoft\Windows\Explorer" -Filter 'thumbcache_*.db' -Force | Remove-Item -Force
Clear-Folder "$env:ProgramData\Microsoft\Windows\WER\ReportArchive"
Clear-Folder "$env:ProgramData\Microsoft\Windows\WER\ReportQueue"
Clear-Folder "$env:LOCALAPPDATA\CrashDumps"
Remove-Item "$env:WINDIR\MEMORY.DMP" -Force
Clear-Folder "$env:WINDIR\Minidump"

# 6) كاش المتصفحات (لا يحذف كلمات المرور أو السجل)
Write-Host '[6/8] حذف كاش المتصفحات (أغلق المتصفح أولاً)...' -ForegroundColor Yellow
$browserCaches = @(
    "$env:LOCALAPPDATA\Google\Chrome\User Data\*\Cache",
    "$env:LOCALAPPDATA\Google\Chrome\User Data\*\Code Cache",
    "$env:LOCALAPPDATA\Microsoft\Edge\User Data\*\Cache",
    "$env:LOCALAPPDATA\Microsoft\Edge\User Data\*\Code Cache",
    "$env:LOCALAPPDATA\Mozilla\Firefox\Profiles\*\cache2"
)
foreach ($p in $browserCaches) { Get-Item $p -Force | ForEach-Object { Clear-Folder $_.FullName } }

# 7) تنظيف مكونات ويندوز القديمة (WinSxS) - قد يأخذ عدة دقائق
Write-Host '[7/8] تنظيف مكونات ويندوز القديمة (قد يستغرق 5-15 دقيقة)...' -ForegroundColor Yellow
Dism.exe /Online /Cleanup-Image /StartComponentCleanup | Out-Null

# 8) أداة تنظيف القرص المدمجة
Write-Host '[8/8] تشغيل أداة تنظيف القرص...' -ForegroundColor Yellow
$vc = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VolumeCaches'
Get-ChildItem $vc | ForEach-Object {
    Set-ItemProperty -Path $_.PSPath -Name StateFlags0099 -Value 2 -Type DWord
}
Start-Process cleanmgr.exe -ArgumentList '/sagerun:99' -Wait

$after = Get-FreeGB
Write-Host "`n=== تم التنظيف. المساحة الحرة الآن: $after GB (وفرنا $([math]::Round($after - $before, 2)) GB) ===`n" -ForegroundColor Green

# ---------- خيارات إضافية ----------

# ملف السبات قد يكون بحجم عدة غيغابايت
if (Test-Path 'C:\hiberfil.sys' -PathType Leaf) {
    $hib = [math]::Round((Get-Item 'C:\hiberfil.sys' -Force).Length / 1GB, 1)
    if (Ask "ملف السبات hiberfil.sys حجمه $hib GB. تعطيل السبات وحذفه؟") {
        powercfg /hibernate off
        Write-Host 'تم تعطيل السبات.' -ForegroundColor Green
    }
}

# ترتيب مجلد التنزيلات حسب نوع الملف
$downloads = (New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path
if (-not $downloads) { $downloads = "$env:USERPROFILE\Downloads" }
if (Ask "ترتيب مجلد التنزيلات ($downloads) في مجلدات حسب النوع؟") {
    $groups = @{
        'صور'      = 'jpg','jpeg','png','gif','bmp','webp','heic','svg'
        'فيديو'    = 'mp4','mkv','avi','mov','wmv','webm'
        'صوتيات'   = 'mp3','wav','m4a','aac','flac','ogg'
        'مستندات'  = 'pdf','doc','docx','xls','xlsx','ppt','pptx','txt','csv'
        'برامج'    = 'exe','msi','msix','appx'
        'مضغوطات'  = 'zip','rar','7z','tar','gz','iso'
    }
    Get-ChildItem $downloads -File | ForEach-Object {
        $ext = $_.Extension.TrimStart('.').ToLower()
        $target = 'أخرى'
        foreach ($g in $groups.Keys) { if ($groups[$g] -contains $ext) { $target = $g; break } }
        $dest = Join-Path $downloads $target
        New-Item -ItemType Directory -Path $dest -Force | Out-Null
        Move-Item -LiteralPath $_.FullName -Destination $dest
    }
    Write-Host 'تم ترتيب مجلد التنزيلات.' -ForegroundColor Green
}

# تقرير بأكبر المجلدات في ملفك الشخصي لتقرر ماذا تنقل إلى القرص D
Write-Host "`n=== أكبر المجلدات في ملفك الشخصي (انقلها يدوياً إلى D: إن أمكن) ===" -ForegroundColor Cyan
Get-ChildItem $env:USERPROFILE -Directory -Force | ForEach-Object {
    $size = (Get-ChildItem $_.FullName -Recurse -File -Force | Measure-Object Length -Sum).Sum
    [pscustomobject]@{ 'الحجم GB' = [math]::Round($size / 1GB, 2); 'المجلد' = $_.FullName }
} | Sort-Object 'الحجم GB' -Descending | Select-Object -First 10 | Format-Table -AutoSize

Write-Host "`n=== أكبر 15 ملف على القرص C ===" -ForegroundColor Cyan
Get-ChildItem 'C:\' -Recurse -File -Force |
    Where-Object { $_.FullName -notmatch '\\Windows\\|pagefile|hiberfil|swapfile' } |
    Sort-Object Length -Descending | Select-Object -First 15 |
    ForEach-Object { '{0,8:N2} GB  {1}' -f ($_.Length / 1GB), $_.FullName }

Read-Host "`nانتهى. اضغط Enter للخروج"
