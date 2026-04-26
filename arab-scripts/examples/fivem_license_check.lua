-- =======================================================================
-- ArabScripts License Verification System (FiveM)
-- =======================================================================

local Config = {}

-- Your License Key from the ArabScripts Customer Dashboard
Config.LicenseKey = "ARAB-XXXX-XXXX"

-- Your exact product slug or ID in the store (Provided by ArabScripts)
Config.ProductSlug = "arab-mdt-pro"

-- ArabScripts API Endpoint for License checks
Config.ApiUrl = "http://localhost:3000/api/licenses/verify" -- Change to actual deployed domain in production


-- DO NOT EDIT BELOW UNLESS YOU KNOW WHAT YOU ARE DOING
local isAuthorized = false

local function PrintError(msg)
    print("^1=========================================================^0")
    print("^1[ArabScripts Auth] ERROR: " .. msg .. "^0")
    print("^1[ArabScripts Auth] Script execution has been halted.^0")
    print("^1=========================================================^0")
end

local function PrintSuccess(msg)
    print("^2=========================================================^0")
    print("^2[ArabScripts Auth] " .. msg .. "^0")
    print("^2=========================================================^0")
end

-- Perform License Check asynchronously when resource starts
CreateThread(function()
    print("^3[ArabScripts Auth] Verifying license key...^0")
    
    local payload = json.encode({
        licenseKey = Config.LicenseKey,
        productSlug = Config.ProductSlug,
        serverId = GetConvar("sv_licenseKey", "UNKNOWN_SERVER_KEY"), -- A unique identifier for the server
        resourceName = GetCurrentResourceName()
    })

    PerformHttpRequest(Config.ApiUrl, function(errorCode, resultData, resultHeaders)
        if errorCode == 200 then
            local data = json.decode(resultData)
            
            if data and data.valid then
                isAuthorized = true
                PrintSuccess("License Authenticated. Welcome to " .. (data.product or "ArabScripts") .. "!")
                -- Initialize your real script logic here.
                -- For example: InitScript()
            else
                PrintError(data.message or "Validation failed.")
            end
        else
            if resultData then
                local data = json.decode(resultData)
                if data and data.message then
                    PrintError(data.message)
                    return
                end
            end
            PrintError("Failed to connect to ArabScripts Auth Server (Error Code: " .. tostring(errorCode) .. ")")
        end
    end, 'POST', payload, { ['Content-Type'] = 'application/json' })
end)


-- =======================================================================
-- MOCK SCRIPT LOGIC (Protected)
-- =======================================================================
-- Use this pattern for your events and callbacks:
-- 
-- RegisterNetEvent('arab:someEvent')
-- AddEventHandler('arab:someEvent', function()
--     if not isAuthorized then return end
--     -- Do stuff
-- end)
